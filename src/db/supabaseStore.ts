/**
 * Minimal server-side Supabase REST store.
 * Keeping this on fetch avoids shipping any database credentials to the browser.
 */
import { DailyReport, DataReconciliation, MacroData, SourceStatus } from "../types";
import { RawOptionContract } from "../providers/types";
import { CmeNqImportResult, StoredCmeImport } from "../cme/types";

export interface RefreshPayload {
  snapshotDate: string;
  snapshotTimestamp: string;
  reports: DailyReport[];
  reconciliations: DataReconciliation[];
  macro: MacroData;
  sourceStatus: SourceStatus[];
  warnings: string[];
  sourceNames: string[];
  contracts: Array<RawOptionContract & { proxy: string }>;
}

export interface StoredRefresh {
  refreshRunId: string;
  snapshotDate: string;
  snapshotTimestamp: string;
  reports: DailyReport[];
  reconciliations: DataReconciliation[];
  macro: MacroData | null;
  sourceStatus: SourceStatus[];
  warnings: string[];
}

const CHUNK_SIZE = 500;

function chunks<T>(input: T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < input.length; i += size) result.push(input.slice(i, i + size));
  return result;
}

function asObject<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" ? (value as T) : fallback;
}

function queryString(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) query.set(key, value); });
  return query.toString();
}

export class SupabaseStore {
  private url: string;
  private secretKey: string;
  private connectionError: string | null = null;

  constructor(url: string, secretKey: string) {
    this.url = url.replace(/\/$/, "");
    this.secretKey = secretKey;
  }

  static fromEnvironment(): SupabaseStore | null {
    const url = process.env.SUPABASE_URL?.trim();
    const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    return url && secretKey ? new SupabaseStore(url, secretKey) : null;
  }

  get lastError(): string | null { return this.connectionError; }

  private async request<T>(method: string, table: string, params: Record<string, string | undefined> = {}, body?: unknown, prefer?: string): Promise<T> {
    const qs = queryString(params);
    const response = await fetch(`${this.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`, {
      method,
      headers: {
        apikey: this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const parsed = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!response.ok) {
      const message = typeof parsed === "object" && parsed ? (parsed as any).message || (parsed as any).hint : String(parsed || response.statusText);
      this.connectionError = `Supabase ${method} ${table}: ${message}`;
      throw new Error(this.connectionError);
    }
    this.connectionError = null;
    return parsed as T;
  }

  async healthcheck(): Promise<void> {
    await this.request<any[]>("GET", "refresh_runs", { select: "id", limit: "1" });
  }

  async loadLatest(): Promise<StoredRefresh | null> {
    const runs = await this.request<any[]>("GET", "refresh_runs", {
      select: "id,snapshot_date,snapshot_timestamp,source_status,warnings",
      status: "in.(success,partial)",
      order: "completed_at.desc",
      limit: "1",
    });
    const run = runs[0];
    if (!run) return null;
    const [reportRows, reconciliationRows, macroRows] = await Promise.all([
      this.request<any[]>("GET", "daily_reports", { select: "report_json", refresh_run_id: `eq.${run.id}`, order: "instrument.asc" }),
      this.request<any[]>("GET", "reconciliation_records", { select: "snapshot_date,snapshot_timestamp,proxy,strike,expiry,option_type,source_values_json,status,resolved_value,resolved_source", refresh_run_id: `eq.${run.id}`, order: "expiry.asc,strike.asc" }),
      this.request<any[]>("GET", "macro_snapshots", { select: "snapshot_date,source,vix,dxy,us10y", refresh_run_id: `eq.${run.id}`, limit: "1" }),
    ]);
    const macro = macroRows[0];
    return {
      refreshRunId: run.id,
      snapshotDate: run.snapshot_date,
      snapshotTimestamp: run.snapshot_timestamp,
      reports: reportRows.map((row) => row.report_json as DailyReport),
      reconciliations: reconciliationRows.map((row) => this.mapReconciliation(row)),
      macro: macro ? { snapshot_date: macro.snapshot_date, source: macro.source, vix: Number(macro.vix ?? 0), dxy: Number(macro.dxy ?? 0), us10y: Number(macro.us10y ?? 0) } : null,
      sourceStatus: asObject<SourceStatus[]>(run.source_status, []),
      warnings: asObject<string[]>(run.warnings, []),
    };
  }

  async getReport(instrument: string, date?: string): Promise<DailyReport | null> {
    const rows = await this.request<any[]>("GET", "daily_reports", {
      select: "report_json",
      instrument: `eq.${instrument}`,
      ...(date ? { snapshot_date: `eq.${date}` } : {}),
      order: "snapshot_date.desc",
      limit: "1",
    });
    return rows[0]?.report_json ? rows[0].report_json as DailyReport : null;
  }

  async getHistory(instrument: string): Promise<Array<{ date: string; report: DailyReport }>> {
    const rows = await this.request<any[]>("GET", "daily_reports", {
      select: "snapshot_date,report_json",
      instrument: `eq.${instrument}`,
      order: "snapshot_date.desc",
      limit: "60",
    });
    return rows.map((row) => ({ date: row.snapshot_date, report: row.report_json as DailyReport }));
  }

  async getReconciliation(proxy: string, date: string): Promise<DataReconciliation[]> {
    const rows = await this.request<any[]>("GET", "reconciliation_records", {
      select: "snapshot_date,snapshot_timestamp,proxy,strike,expiry,option_type,source_values_json,status,resolved_value,resolved_source",
      proxy: `eq.${proxy}`,
      snapshot_date: `eq.${date}`,
      order: "expiry.asc,strike.asc",
      limit: "5000",
    });
    return rows.map((row) => this.mapReconciliation(row));
  }

  private mapReconciliation(row: any): DataReconciliation {
    return {
      snapshot_date: row.snapshot_date,
      snapshot_timestamp: row.snapshot_timestamp,
      proxy: row.proxy,
      strike: Number(row.strike),
      expiry: row.expiry,
      option_type: row.option_type,
      source_values_json: asObject(row.source_values_json, {}),
      status: row.status,
      resolved_value: asObject(row.resolved_value, { oi: 0, iv: 0, gamma: 0 }),
      resolved_source: row.resolved_source,
    };
  }

  async persistRefresh(payload: RefreshPayload): Promise<string> {
    const runRows = await this.request<any[]>("POST", "refresh_runs", { select: "id" }, {
      status: payload.reports.length === 2 ? "success" : "partial",
      snapshot_date: payload.snapshotDate,
      snapshot_timestamp: payload.snapshotTimestamp,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      source_names: payload.sourceNames,
      source_status: payload.sourceStatus,
      warnings: payload.warnings,
    }, "return=representation");
    const refreshRunId = runRows[0]?.id;
    if (!refreshRunId) throw new Error("Supabase did not return refresh run id.");

    await this.request("POST", "daily_reports", { on_conflict: "snapshot_date,instrument" }, payload.reports.map((report) => ({
      refresh_run_id: refreshRunId,
      snapshot_date: payload.snapshotDate,
      instrument: report.instrument,
      proxy: report.proxy,
      as_of: report.as_of,
      data_confidence: report.data_confidence,
      report_json: report,
    })), "resolution=merge-duplicates,return=minimal");

    const proxies = [...new Set(payload.reconciliations.map((record) => record.proxy))];
    for (const proxy of proxies) await this.request("DELETE", "reconciliation_records", { snapshot_date: `eq.${payload.snapshotDate}`, proxy: `eq.${proxy}` }, undefined, "return=minimal");
    const reconciliationRows = payload.reconciliations.map((record) => ({
      refresh_run_id: refreshRunId,
      snapshot_date: record.snapshot_date,
      snapshot_timestamp: record.snapshot_timestamp || payload.snapshotTimestamp,
      proxy: record.proxy,
      expiry: record.expiry,
      strike: record.strike,
      option_type: record.option_type,
      source_values_json: record.source_values_json,
      status: record.status,
      resolved_value: record.resolved_value,
      resolved_source: record.resolved_source,
    }));
    for (const part of chunks(reconciliationRows)) await this.request("POST", "reconciliation_records", {}, part, "return=minimal");

    await this.request("POST", "macro_snapshots", { on_conflict: "snapshot_date" }, {
      refresh_run_id: refreshRunId,
      snapshot_date: payload.macro.snapshot_date,
      source: payload.macro.source,
      vix: payload.macro.vix,
      dxy: payload.macro.dxy,
      us10y: payload.macro.us10y,
    }, "resolution=merge-duplicates,return=minimal");

    const proxiesWithContracts = [...new Set(payload.contracts.map((contract) => contract.proxy))];
    for (const proxy of proxiesWithContracts) await this.request("DELETE", "option_contracts", { snapshot_date: `eq.${payload.snapshotDate}`, proxy: `eq.${proxy}` }, undefined, "return=minimal");
    const contractRows = payload.contracts.map((contract) => ({
      refresh_run_id: refreshRunId,
      snapshot_date: payload.snapshotDate,
      proxy: contract.proxy,
      source: contract.source,
      expiry: contract.expiry,
      strike: contract.strike,
      option_type: contract.option_type,
      oi: contract.oi,
      iv: contract.iv,
      volume: contract.volume,
    }));
    for (const part of chunks(contractRows)) await this.request("POST", "option_contracts", {}, part, "return=minimal");
    return refreshRunId;
  }

  async persistCmeImport(payload: CmeNqImportResult): Promise<StoredCmeImport> {
    const summary = {
      tradeDate: payload.tradeDate,
      bulletinDateText: payload.bulletinDateText,
      parserVersion: payload.parserVersion,
      underlyingContract: payload.underlyingContract,
      futuresSettlement: payload.futuresSettlement,
      contractCount: payload.contractCount,
      expirySummaries: payload.expirySummaries,
      warnings: payload.warnings,
    };
    const existing = await this.request<any[]>("GET", "cme_bulletin_imports", {
      select: "id,trade_date,underlying_contract,futures_settlement,contract_count,source_file_name,created_at,warnings,summary_json",
      sha256: `eq.${payload.sha256}`,
      limit: "1",
    });
    if (existing[0]) return this.mapCmeImport(existing[0]);

    const rows = await this.request<any[]>("POST", "cme_bulletin_imports", { select: "id,trade_date,underlying_contract,futures_settlement,contract_count,source_file_name,created_at,warnings,summary_json" }, {
      trade_date: payload.tradeDate,
      bulletin_date_text: payload.bulletinDateText,
      source_file_name: payload.fileName,
      sha256: payload.sha256,
      parser_version: payload.parserVersion,
      underlying_contract: payload.underlyingContract,
      futures_settlement: payload.futuresSettlement,
      contract_count: payload.contractCount,
      status: "parsed",
      warnings: payload.warnings,
      summary_json: summary,
    }, "return=representation");
    const imported = rows[0];
    if (!imported?.id) throw new Error("Supabase did not return a CME import id.");

    const optionRows = payload.contracts.map((contract) => ({
      import_id: imported.id,
      trade_date: contract.tradeDate,
      underlying_contract: contract.underlyingContract,
      option_family: contract.optionFamily,
      option_code: contract.optionCode,
      expiry_label: contract.expiryLabel,
      expiry_date: contract.expiryDate,
      expiry_precision: contract.expiryPrecision,
      option_type: contract.optionType,
      strike: contract.strike,
      settlement: contract.settlement,
      delta: contract.delta,
      open_interest: contract.openInterest,
      volume: contract.volume,
      source_page: contract.sourcePage,
      raw_row_json: contract.rawRow,
    }));
    for (const part of chunks(optionRows)) await this.request("POST", "cme_nq_option_contracts", {}, part, "return=minimal");
    return this.mapCmeImport(imported);
  }

  async listCmeImports(): Promise<StoredCmeImport[]> {
    const rows = await this.request<any[]>("GET", "cme_bulletin_imports", {
      select: "id,trade_date,underlying_contract,futures_settlement,contract_count,source_file_name,created_at,warnings,summary_json",
      order: "created_at.desc",
      limit: "30",
    });
    return rows.map((row) => this.mapCmeImport(row));
  }

  private mapCmeImport(row: any): StoredCmeImport {
    const summary = asObject(row.summary_json, {} as any);
    return {
      id: row.id,
      tradeDate: row.trade_date,
      underlyingContract: row.underlying_contract,
      futuresSettlement: Number(row.futures_settlement),
      contractCount: Number(row.contract_count),
      fileName: row.source_file_name,
      createdAt: row.created_at,
      warnings: asObject<string[]>(row.warnings, []),
      summary,
    };
  }

}
