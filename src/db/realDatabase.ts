/**
 * Durable real-data snapshot service.
 * No random or simulated market data is used in this production path.
 */
import {
  ApplicationStatus,
  DailyReport,
  DataReconciliation,
  MacroData,
  RefreshResult,
  SourceStatus,
} from "../types";
import { InstrumentMapping, OptionsDataProvider, RawOptionContract } from "../providers/types";
import { OptionDataFetchError, orchestrateOptionData } from "../providers/dataOrchestrator";
import { getMacroFromFred } from "../providers/fredMacro";
import { analyzeMarketStructure } from "../utils/engine";
import { fetchFuturesBasis, applyBasisToReport } from "../providers/futuresBasis";
import { computeCmeGex } from "../cme/cmeGex";
import { analyzeCmeResolved, buildCmeAuditStatus, buildCmeExpiryBreakdown, buildConfluence, buildDefaultSessionMonitor, buildPlaybook, buildTradingViewPayloads } from "../cme/report";
import type { CmeImportWithContracts } from "../cme/report";
import { SupabaseStore } from "./supabaseStore";

export interface RealDatabaseConfig {
  primary: OptionsDataProvider;
  secondary?: OptionsDataProvider;
  maxExpiries: number;
  fredApiKey?: string;
  store?: SupabaseStore | null;
  marketDataConfigured?: boolean;
}

function dateTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function uniqueSourceStatus(statuses: SourceStatus[]): SourceStatus[] {
  const bySource = new Map<string, SourceStatus>();
  for (const item of statuses) {
    const current = bySource.get(item.source);
    // Keep failures if any source failed for one of the required symbols; otherwise retain latest state.
    if (!current || item.state === "failed" || current.state !== "failed") bySource.set(item.source, item);
  }
  return [...bySource.values()];
}

export class RealMarketDatabase {
  public instruments: InstrumentMapping[] = [];
  public dailyReports: Record<string, DailyReport[]> = {};
  public dataReconciliation: DataReconciliation[] = [];
  public macroData: MacroData[] = [];

  private config: RealDatabaseConfig;
  private lastRefreshDate: string | null = null;
  private lastRefreshTimestamp: string | null = null;
  private refreshInFlight: Promise<RefreshResult> | null = null;
  private lastRefresh: RefreshResult | null = null;
  private initializationWarning: string | null = null;

  constructor(config: RealDatabaseConfig) {
    this.config = config;
    this.instruments = [
      { futuresCode: "NQ", futuresName: "Nasdaq 100 Futures", indexSymbol: "NDX", enabled: true, sort_order: 1 },
      { futuresCode: "ES", futuresName: "S&P 500 E-mini Futures", indexSymbol: "SPX", enabled: true, sort_order: 2 },
    ];
  }

  public async initialize(): Promise<void> {
    if (!this.config.store) return;
    try {
      await this.config.store.healthcheck();
      const latest = await this.config.store.loadLatest();
      if (!latest) return;
      this.dailyReports[latest.snapshotDate] = latest.reports;
      this.dataReconciliation = latest.reconciliations;
      if (latest.macro) this.macroData = [latest.macro];
      this.lastRefreshDate = latest.snapshotDate;
      this.lastRefreshTimestamp = latest.snapshotTimestamp;
      this.lastRefresh = {
        success: true,
        date: latest.snapshotDate,
        sources: latest.sourceStatus.filter((s) => s.state === "ok").map((s) => s.source),
        warnings: latest.warnings,
        sourceStatus: latest.sourceStatus,
        persisted: true,
        refreshRunId: latest.refreshRunId,
      };
    } catch (error: any) {
      this.initializationWarning = error?.message || "Supabase initialization failed";
      console.error("[database]", this.initializationWarning);
    }
  }

  public getInstrumentsLegacyShape() {
    return this.instruments.map((i) => ({
      code: i.futuresCode,
      name: i.futuresName,
      proxy: i.indexSymbol,
      enabled: i.enabled,
      sort_order: i.sort_order,
    }));
  }

  public getStatus(): ApplicationStatus {
    // Treat Supabase configuration separately from optional snapshot-refresh health.
    // CME PG40 imports live in their own tables and can be fully usable even when
    // refresh_runs / proxy snapshots / TradingView tables are missing or stale.
    // Previously any Supabase REST error poisoned `store.lastError`, made the app
    // show "memory_only", and blocked the dashboard from reading the latest CME
    // import. That is why a valid 2026-07-08 v0.3 CME import could exist while the
    // dashboard still rendered the old 2026-07-07 v0.1 row.
    const database: ApplicationStatus["database"] = this.config.store ? "connected" : "not_configured";
    const persisted = Boolean(this.config.store);
    const warnings = [
      ...(this.initializationWarning ? [`Supabase snapshot initialization warning: ${this.initializationWarning}`] : []),
      ...(this.config.store?.lastError ? [`Supabase optional-store warning: ${this.config.store.lastError}`] : []),
      ...(this.lastRefresh?.warnings || []),
    ];
    const successfulSources = this.lastRefresh?.sourceStatus.filter((s) => s.state === "ok").length || 0;
    const service: ApplicationStatus["service"] =
      !this.lastRefreshDate ? (database === "not_configured" ? "unconfigured" : "degraded") :
      successfulSources > 0 ? (warnings.length ? "degraded" : "ok") : "degraded";
    return {
      service,
      database,
      persistence: persisted ? "durable" : "memory_only",
      latestSnapshotDate: this.lastRefreshDate,
      latestSnapshotTimestamp: this.lastRefreshTimestamp,
      lastRefresh: this.lastRefresh,
      sourceStatus: this.lastRefresh?.sourceStatus || [],
      warnings,
    };
  }

  public async getDailyReport(instrument: string, date?: string): Promise<DailyReport | null> {
    const normalizedInstrument = instrument.toUpperCase();

    // CME PG40 imports are authoritative for NQ and may be uploaded independently of
    // the MarketData refresh job. Therefore the dashboard must be able to render the
    // latest CME import directly instead of waiting for a new daily_reports row.
    if (normalizedInstrument === "NQ") {
      const cmeReport = await this.getCmeOfficialReport(date);
      if (cmeReport) return cmeReport;
    }

    if (this.config.store) {
      try {
        const stored = await this.config.store.getReport(normalizedInstrument, date);
        if (stored) return stored;
      } catch (error: any) {
        console.warn(`[dashboard] Stored proxy report unavailable; falling back to in-memory snapshot: ${error?.message || error}`);
      }
    }
    const targetDate = date || Object.keys(this.dailyReports).sort().at(-1);
    return targetDate ? this.dailyReports[targetDate]?.find((report) => report.instrument === normalizedInstrument) || null : null;
  }

  public async getHistory(instrument: string) {
    if (this.config.store) {
      try {
        const history = await this.config.store.getHistory(instrument);
        if (history.length) return history.map(({ date, report }) => this.toHistoryRow(date, report));
      } catch (error: any) {
        console.warn(`[dashboard] Stored history unavailable; falling back to in-memory history: ${error?.message || error}`);
      }
    }
    return Object.keys(this.dailyReports)
      .sort()
      .reverse()
      .map((date) => {
        const report = this.dailyReports[date].find((item) => item.instrument === instrument);
        return report ? this.toHistoryRow(date, report) : null;
      })
      .filter(Boolean);
  }

  public async getReconciliation(proxy: string, date: string): Promise<DataReconciliation[]> {
    if (this.config.store) {
      try {
        const stored = await this.config.store.getReconciliation(proxy, date);
        if (stored.length) return stored;
      } catch (error: any) {
        console.warn(`[dashboard] Stored reconciliation unavailable; falling back to in-memory records: ${error?.message || error}`);
      }
    }
    return this.dataReconciliation.filter((record) => record.proxy === proxy && record.snapshot_date === date);
  }

  private toHistoryRow(date: string, report: DailyReport) {
    return {
      date,
      close: report.price.last,
      flip_level: report.gamma.flip_level,
      status: report.gamma.status,
      quadrant: report.regime.quadrant,
      label: report.regime.label,
      call_wall_1: report.gamma.call_walls[0]?.strike,
      put_wall_1: report.gamma.put_walls[0]?.strike,
      confidence: report.data_confidence,
    };
  }


  private async getCmeOfficialReport(date?: string): Promise<DailyReport | null> {
    // Do not gate CME reads on store.lastError. A non-critical error from
    // refresh_runs, daily_reports, or tradingview_events should not prevent the
    // authoritative CME PG40 tables from being used.
    if (!this.config.store) return null;
    try {
      const cmeData = date
        ? await this.config.store.getCmeContractsByTradeDate(date)
        : await this.config.store.getLatestCmeContractsByTradeDate();
      if (!cmeData || !cmeData.contracts.length || cmeData.futuresSettlement <= 0) return null;

      let proxyReport: DailyReport | null = null;
      try {
        const storedProxyCandidate = await this.config.store.getReport("NQ", cmeData.tradeDate);
        // Use stored proxy data only as Layer 2 confluence. If that row is already a
        // CME report, do not compare CME against itself.
        if (storedProxyCandidate && storedProxyCandidate.data_mode !== "CME_PG40") {
          proxyReport = storedProxyCandidate;
        }
      } catch {
        proxyReport = null;
      }

      return this.buildCmeOfficialReport(cmeData, cmeData.tradeDate, proxyReport);
    } catch (error: any) {
      console.warn(`[cme-dashboard] Unable to build CME dashboard report: ${error?.message || error}`);
      return null;
    }
  }

  private buildCmeOfficialReport(cmeData: CmeImportWithContracts, dashboardDate: string, proxyReport?: DailyReport | null): DailyReport {
    const latestMacro = this.macroData[0];
    const macro = proxyReport?.macro || (latestMacro ? {
      VIX: latestMacro.vix,
      DXY: latestMacro.dxy,
      US10Y: latestMacro.us10y,
    } : { VIX: 0, DXY: 0, US10Y: 4.0 });

    const cme = computeCmeGex(cmeData.contracts, cmeData.futuresSettlement);
    const cmeExpiryCount = new Set(cmeData.contracts.map((contract) => contract.expiryDate)).size;
    const rowCoverageLow = cmeData.contracts.length < 1500 || cmeExpiryCount < 6;
    const rowCoverageMedium = cmeData.contracts.length < 2500 || cmeExpiryCount < 10;
    const cmeConfidence: "high" | "medium" | "low" = rowCoverageLow
      ? "low"
      : rowCoverageMedium
        ? "medium"
        : cme.ivReconstructedPct >= 70 ? "high" : cme.ivReconstructedPct >= 40 ? "medium" : "low";
    const cmeReport = analyzeCmeResolved(
      cmeData.underlyingContract,
      cmeData.tradeDate,
      cmeData.futuresSettlement,
      cme.resolved,
      cmeConfidence,
      macro,
    );
    const { expiryBreakdown, selectedPanels } = buildCmeExpiryBreakdown(cmeData, cme.resolved, cmeConfidence, macro);

    cmeReport.data_mode = "CME_PG40";
    cmeReport.primary_source = "CME PG40 Official EOD";
    cmeReport.source_status = {
      currentModel: "CME Official EOD Map",
      dataMode: "CME_PG40",
      primarySource: "CME PG40 Official EOD",
      dashboardDate,
      cmeTradeDate: cmeData.tradeDate,
      cmeImportId: cmeData.id,
      cmeUnderlying: cmeData.underlyingContract,
      cmeFuturesSettlement: cmeData.futuresSettlement,
      cmeImportTimestamp: cmeData.createdAt || null,
      cmeContractsParsed: cmeData.contracts.length,
      cmeExpiryGroups: expiryBreakdown.length,
      fallbackUsed: false,
      fallbackReason: null,
      sourceWarnings: [
        ...cmeData.warnings,
        `CME Black-76 futures-options engine used with NQ multiplier 20. IV reconstruction coverage ${cme.ivReconstructedPct}%.`,
        ...(rowCoverageMedium ? [`CME parser coverage check: fetched ${cmeData.contracts.length} rows across ${cmeExpiryCount} expiry groups; full-chain target is roughly 3,000–4,000 rows and 15–20 expiry groups. Treat headline walls as provisional until coverage is complete.`] : []),
        "CME PG40 was user-uploaded and is rendered directly from the selected import; it is not live intraday options flow.",
        ...(proxyReport ? ["NDX proxy snapshot is retained only as Layer 2 confluence, not as CME futures options OI consensus."] : ["No same-date NDX proxy refresh row was available; dashboard is showing Layer 1 CME PG40 only."]),
      ],
      proxy: {
        instrument: "NDX",
        snapshotDate: proxyReport?.as_of?.slice(0, 10) || null,
        available: Boolean(proxyReport),
      },
      sessionFlow: { available: false, note: "Session Flow unavailable — currently using CME EOD OI baseline until TradingView webhook events arrive." },
    };
    cmeReport.cme_audit = buildCmeAuditStatus(cmeData);
    cmeReport.expiry_breakdown = expiryBreakdown;
    cmeReport.selected_expiry_panels = selectedPanels;
    cmeReport.tradingview_payloads = buildTradingViewPayloads(cmeReport);
    cmeReport.session_monitor = buildDefaultSessionMonitor(cmeReport);
    cmeReport.playbook = buildPlaybook(cmeReport);
    if (proxyReport) cmeReport.confluence = buildConfluence(cmeReport, proxyReport);
    return cmeReport;
  }

  public async refresh(): Promise<RefreshResult> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refreshInternal().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refreshInternal(): Promise<RefreshResult> {
    const warnings: string[] = [];
    const sourceNames = new Set<string>();
    const sourceStatuses: SourceStatus[] = [];
    const snapshotTimestamp = new Date().toISOString();

    let macro = { VIX: 0, DXY: 0, US10Y: 4.0 };
    let macroDate = dateTodayUtc();
    let macroSource = "fallback";
    if (this.config.fredApiKey || process.env.FRED_API_KEY) {
      try {
        const result = await getMacroFromFred(this.config.fredApiKey);
        macroDate = result.date;
        macro = { VIX: result.vix ?? 0, DXY: result.dxy ?? 0, US10Y: result.us10y ?? 4.0 };
        macroSource = Object.values(result.sources).join(", ") || "FRED";
        Object.values(result.sources).forEach((source) => sourceNames.add(source));
        sourceStatuses.push({
          source: "fred",
          state: "ok",
          isDelayed: true,
          delayNote: "Macro series are published on their own update schedules.",
          checkedAt: snapshotTimestamp,
        });
        if (result.dxy === null) warnings.push("DXY is unavailable from the configured free macro source and is shown as N/A.");
        if (result.us10y === null) warnings.push("US10Y was unavailable; the risk-free-rate fallback of 4.0% was used.");
      } catch (error: any) {
        const detail = error?.message || String(error);
        warnings.push(`FRED macro retrieval failed: ${detail}. The risk-free-rate fallback of 4.0% was used.`);
        sourceStatuses.push({
          source: "fred",
          state: "failed",
          isDelayed: true,
          delayNote: "Macro series are published on their own update schedules.",
          detail,
          checkedAt: snapshotTimestamp,
        });
      }
    } else {
      warnings.push("FRED_API_KEY is not configured; the risk-free-rate fallback of 4.0% was used.");
      sourceStatuses.push({
        source: "fred",
        state: "not_configured",
        isDelayed: true,
        delayNote: "Macro series are published on their own update schedules.",
        detail: "FRED_API_KEY is missing",
        checkedAt: snapshotTimestamp,
      });
    }

    const reports: DailyReport[] = [];
    const reconciliations: DataReconciliation[] = [];
    const contracts: Array<RawOptionContract & { proxy: string }> = [];
    let snapshotDate = macroDate;

    for (const instrument of this.instruments.filter((item) => item.enabled)) {
      try {
        const result = await orchestrateOptionData(instrument.indexSymbol, {
          primary: this.config.primary,
          secondary: this.config.secondary,
          maxExpiries: this.config.maxExpiries,
        });
        result.sourcesUsed.forEach((source) => sourceNames.add(source));
        sourceStatuses.push(...result.sourceStatus);
        snapshotDate = result.snapshotDate || snapshotDate;

        const overnightHigh = result.prevClose
          ? Math.round(Math.max(result.lastPrice, result.prevClose) * 1.003)
          : Math.round(result.lastPrice * 1.003);
        const overnightLow = result.prevClose
          ? Math.round(Math.min(result.lastPrice, result.prevClose) * 0.997)
          : Math.round(result.lastPrice * 0.997);
        const report = analyzeMarketStructure(
          instrument.futuresCode,
          instrument.indexSymbol,
          `${result.snapshotDate}T16:00:00-04:00`,
          result.lastPrice,
          result.resolved,
          result.confidence,
          overnightHigh,
          overnightLow,
          macro,
        );

        // 基差調整:把指數座標的水位平移成期貨座標 (NQ/ES 圖可直接使用)。
        // 抓不到期貨價就不調整,並誠實回報 (水位仍為指數座標)。
        const basisInfo = await fetchFuturesBasis(instrument.futuresCode, result.lastPrice);
        if (basisInfo) {
          applyBasisToReport(report, basisInfo.basis);
          warnings.push(
            `${instrument.futuresCode} levels basis-adjusted by ${basisInfo.basis >= 0 ? "+" : ""}${basisInfo.basis.toFixed(1)} (futures ${basisInfo.futuresLast} vs index ${basisInfo.indexLast}).`,
          );
        } else {
          warnings.push(
            `${instrument.futuresCode}: futures quote unavailable; levels remain in ${instrument.indexSymbol} index terms (no basis adjustment).`,
          );
        }

        // Default role: Layer 2 proxy / fallback. CME may override only when tradeDate === Dashboard date.
        let finalReport = report;
        finalReport.data_mode = "NDX_PROXY_FALLBACK";
        finalReport.primary_source = `${instrument.indexSymbol} proxy`;
        finalReport.source_status = {
          currentModel: "NDX Proxy Fallback",
          dataMode: "NDX_PROXY_FALLBACK",
          primarySource: `${instrument.indexSymbol} proxy`,
          dashboardDate: result.snapshotDate,
          cmeTradeDate: null,
          cmeImportId: null,
          cmeUnderlying: null,
          cmeFuturesSettlement: null,
          cmeImportTimestamp: null,
          cmeContractsParsed: null,
          cmeExpiryGroups: null,
          fallbackUsed: true,
          fallbackReason: "No exact-date CME PG40 was available for this dashboard date.",
          sourceWarnings: [
            `${instrument.indexSymbol} / proxy levels are for confluence only and are not CME futures options OI consensus.`,
          ],
          proxy: { instrument: instrument.indexSymbol, snapshotDate: result.snapshotDate, available: true },
          sessionFlow: { available: false, note: "Session Flow unavailable — currently using EOD OI baseline." },
        };
        finalReport.tradingview_payloads = buildTradingViewPayloads(finalReport);
        finalReport.session_monitor = buildDefaultSessionMonitor(finalReport);
        finalReport.playbook = buildPlaybook(finalReport);

        // === CME 精算優先 (僅 NQ,且 tradeDate 嚴格等於 Dashboard date) ===
        // CME PG40 是 Layer 1 Official EOD Baseline，不是 live flow；NDX 只保留為 confluence。
        if (instrument.futuresCode.toUpperCase() === "NQ" && this.config.store) {
          try {
            const cmeData = await this.config.store.getCmeContractsByTradeDate(result.snapshotDate);
            if (cmeData && cmeData.contracts.length > 0 && cmeData.futuresSettlement > 0) {
              const cme = computeCmeGex(cmeData.contracts, cmeData.futuresSettlement);
              const cmeExpiryCount = new Set(cmeData.contracts.map((contract) => contract.expiryDate)).size;
              const rowCoverageLow = cmeData.contracts.length < 1500 || cmeExpiryCount < 6;
              const rowCoverageMedium = cmeData.contracts.length < 2500 || cmeExpiryCount < 10;
              const cmeConfidence: "high" | "medium" | "low" = rowCoverageLow
                ? "low"
                : rowCoverageMedium
                  ? "medium"
                  : cme.ivReconstructedPct >= 70 ? "high" : cme.ivReconstructedPct >= 40 ? "medium" : "low";
              const cmeReport = analyzeCmeResolved(
                cmeData.underlyingContract,
                cmeData.tradeDate,
                cmeData.futuresSettlement,
                cme.resolved,
                cmeConfidence,
                macro,
              );
              const { expiryBreakdown, selectedPanels } = buildCmeExpiryBreakdown(cmeData, cme.resolved, cmeConfidence, macro);
              cmeReport.data_mode = "CME_PG40";
              cmeReport.primary_source = "CME PG40 Official EOD";
              cmeReport.source_status = {
                currentModel: "CME Official EOD Map",
                dataMode: "CME_PG40",
                primarySource: "CME PG40 Official EOD",
                dashboardDate: result.snapshotDate,
                cmeTradeDate: cmeData.tradeDate,
                cmeImportId: cmeData.id,
                cmeUnderlying: cmeData.underlyingContract,
                cmeFuturesSettlement: cmeData.futuresSettlement,
                cmeImportTimestamp: cmeData.createdAt || null,
                cmeContractsParsed: cmeData.contracts.length,
                cmeExpiryGroups: expiryBreakdown.length,
                fallbackUsed: false,
                fallbackReason: null,
                sourceWarnings: [
                  ...cmeData.warnings,
                  `CME Black-76 futures-options engine used with NQ multiplier 20. IV reconstructed ${cme.ivReconstructedPct}%.`,
                  "Session Flow unavailable — currently using CME EOD OI baseline until TradingView webhook events arrive.",
                ],
                proxy: { instrument: instrument.indexSymbol, snapshotDate: result.snapshotDate, available: true },
                sessionFlow: { available: false, note: "Session Flow unavailable — currently using CME EOD OI baseline." },
              };
              cmeReport.cme_audit = buildCmeAuditStatus(cmeData);
              cmeReport.expiry_breakdown = expiryBreakdown;
              cmeReport.selected_expiry_panels = selectedPanels;
              cmeReport.tradingview_payloads = buildTradingViewPayloads(cmeReport);
              cmeReport.session_monitor = buildDefaultSessionMonitor(cmeReport);
              cmeReport.playbook = buildPlaybook(cmeReport);
              cmeReport.confluence = buildConfluence(cmeReport, report);
              finalReport = cmeReport;
              warnings.push(
                `NQ report computed from exact-date CME PG40 official futures options. Trade date ${cme.tradeDate}, futures settle ${cme.futuresSettlement}, IV reconstructed ${cme.ivReconstructedPct}%.`,
              );
            } else {
              warnings.push(`NQ: no CME PG40 import found for dashboard date ${result.snapshotDate}; using NDX Proxy Fallback and clearly marking fallback mode.`);
            }
          } catch (e: any) {
            warnings.push(`CME exact-date load/compute failed for ${result.snapshotDate}; fell back to NDX proxy: ${e?.message || e}`);
          }
        }

        reports.push(finalReport);
        reconciliations.push(...result.reconciliations.map((record) => ({ ...record, snapshot_timestamp: snapshotTimestamp })));
        contracts.push(...result.rawContracts.map((contract) => ({ ...contract, proxy: instrument.indexSymbol })));
      } catch (error: any) {
        const detail = error?.message || String(error);
        if (error instanceof OptionDataFetchError) {
          sourceStatuses.push(...error.sourceStatus);
        }
        warnings.push(`${instrument.futuresCode} (${instrument.indexSymbol}) data retrieval failed: ${detail}`);
      }
    }

    const sourceStatus = uniqueSourceStatus(sourceStatuses);
    if (!reports.length) {
      const result: RefreshResult = {
        success: false,
        date: snapshotDate,
        sources: [...sourceNames],
        warnings: [...warnings, "No verified option-data snapshot was created."],
        sourceStatus,
        persisted: false,
      };
      this.lastRefresh = result;
      return result;
    }

    const macroSnapshot: MacroData = {
      snapshot_date: snapshotDate,
      source: macroSource,
      vix: macro.VIX,
      dxy: macro.DXY,
      us10y: macro.US10Y,
    };
    let persisted = false;
    let refreshRunId: string | undefined;
    if (this.config.store) {
      try {
        refreshRunId = await this.config.store.persistRefresh({
          snapshotDate,
          snapshotTimestamp,
          reports,
          reconciliations,
          macro: macroSnapshot,
          sourceStatus,
          warnings,
          sourceNames: [...sourceNames],
          contracts,
        });
        persisted = true;
      } catch (error: any) {
        const detail = error?.message || String(error);
        warnings.push(`Supabase persistence failed: ${detail}`);
      }
    } else {
      warnings.push("Supabase is not configured; this snapshot is memory-only and will be lost on restart.");
    }

    this.dailyReports[snapshotDate] = reports;
    this.dataReconciliation = reconciliations;
    this.macroData = [macroSnapshot];
    this.lastRefreshDate = snapshotDate;
    this.lastRefreshTimestamp = snapshotTimestamp;
    const result: RefreshResult = {
      success: true,
      date: snapshotDate,
      sources: [...sourceNames],
      warnings,
      sourceStatus,
      persisted,
      refreshRunId,
    };
    this.lastRefresh = result;
    return result;
  }
}
