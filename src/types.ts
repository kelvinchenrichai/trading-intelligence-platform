/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Instrument {
  code: string;
  name: string;
  proxy: string;
  enabled: boolean;
  sort_order: number;
}

export interface OptionChainRaw {
  source: string;
  snapshot_date: string;
  expiry: string;
  strike: number;
  option_type: "call" | "put";
  oi: number;
  iv: number;
  gamma: number;
  volume: number;
}

export interface PriceBar {
  instrument: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacroData {
  snapshot_date: string;
  source: string;
  vix: number;
  dxy: number;
  us10y: number;
}

export interface DataReconciliation {
  snapshot_date: string;
  snapshot_timestamp?: string;
  proxy: string;
  strike: number;
  expiry: string;
  option_type: "call" | "put";
  source_values_json: Record<string, { oi: number; iv: number; gamma: number }>;
  status: "consensus" | "conflict";
  resolved_value: { oi: number; iv: number; gamma: number };
  resolved_source: string;
}

export interface GexStrikeData {
  strike: number;
  call_gex: number;
  put_gex: number;
  net_gex: number;
  oi: number;
}


export type DataMode = "CME_PG40" | "NDX_PROXY_FALLBACK" | "HYBRID_CONFLUENCE" | "NO_DATA";
export type CurrentModel = "CME Official EOD Map" | "NDX Proxy Fallback" | "Hybrid / Confluence" | "No Data";

export interface ExpiryGexSummary {
  label: string;
  expiryDate: string;
  dte: number;
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  gammaPivot: number | null;
  netGex: number;
  grossGex: number;
  positiveGex: number;
  negativeGex: number;
  expiryStructureImpactPct: number;
  strikeCount: number;
  gexStrikes: GexStrikeData[];
  rawNetGex?: number;
  rawGrossGex?: number;
  pointNetGex?: number;
  pointGrossGex?: number;
  comparableNetGex?: number;
  comparableGrossGex?: number;
}

export interface GexDisplayCalibration {
  rawNetGex: number;
  rawGrossGex: number;
  pointNetGex: number;
  pointGrossGex: number;
  comparableNetGex: number;
  comparableGrossGex: number;
  contractMultiplier: number;
  comparableDivisor: number;
  comparableNetDivisor?: number;
  comparableGrossDivisor?: number;
  mode: "RAW_CME" | "POINT_GEX" | "COMPARABLE_SCALE";
  benchmark?: {
    vendor: string;
    tradeDate: string;
    netGex: number;
    totalGex: number;
    putSupport: number;
    callResistance: number;
    hvl: number;
  };
  note: string;
}

export interface DataSourceStatusBlock {
  currentModel: CurrentModel;
  dataMode: DataMode;
  primarySource: string;
  dashboardDate: string;
  cmeTradeDate?: string | null;
  cmeImportId?: string | null;
  cmeUnderlying?: string | null;
  cmeFuturesSettlement?: number | null;
  cmeImportTimestamp?: string | null;
  cmeContractsParsed?: number | null;
  cmeExpiryGroups?: number | null;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  sourceWarnings: string[];
  proxy?: {
    instrument: string;
    snapshotDate?: string | null;
    available: boolean;
  };
  sessionFlow?: {
    available: boolean;
    note: string;
  };
}

export interface CmeAuditStatus {
  tradeDate: string;
  underlyingContract: string;
  futuresSettlement: number;
  parsedContractsCount: number;
  expiryGroupsCount: number;
  totalCallOi: number;
  totalPutOi: number;
  totalVolume: number;
  pdfHash?: string | null;
  importTimestamp?: string | null;
  parserVersion?: string | null;
  warnings: string[];
  duplicateStatus?: string | null;
}

export interface TradingViewPayloads {
  simpleCsv: string;
  keyValue: string;
  compact: string;
}

export interface SessionMonitorState {
  lastEvent?: string | null;
  gammaFlipTouched: boolean;
  gammaFlipReclaimed: boolean;
  callWallTouched: boolean;
  callWallBreakoutConfirmed: boolean;
  putWallTouched: boolean;
  putWallBreakdownConfirmed: boolean;
  wallFlipped?: "support" | "resistance" | null;
  currentSessionRegime: "No Edge" | "Consolidation / Pin" | "Expansion Up" | "Expansion Down" | "Neutral / Wait";
  explanation: string;
  updatedAt?: string | null;
}

export interface PlaybookOutput {
  bias: string;
  favor: string;
  avoid: string;
  trigger: string;
  invalidation: string;
  keyLevels: Array<{ label: string; level: number | null }>;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface OfficialProxyConfluence {
  cmeCallWall?: number | null;
  proxyCallWall?: number | null;
  callWallDiffPts?: number | null;
  cmePutWall?: number | null;
  proxyPutWall?: number | null;
  putWallDiffPts?: number | null;
  cmeRegime?: string | null;
  proxyRegime?: string | null;
  score: "High" | "Medium" | "Low" | "Unavailable";
  note: string;
}

export interface DailyReport {
  instrument: string;
  proxy: string;
  enabled: boolean;
  as_of: string;
  data_confidence: "high" | "medium" | "low";
  gamma: {
    status: "positive" | "negative";
    flip_level: number;
    call_walls: Array<{ strike: number; rank: number; gex: number; dist_pts?: number; confluence?: "confluent" | "split" }>;
    put_walls: Array<{ strike: number; rank: number; gex: number; dist_pts?: number; confluence?: "confluent" | "split" }>;
    max_pain: number;
    gex_strikes: GexStrikeData[];
  };
  price: {
    last: number;
    expected_move: {
      points: number;
      low: number;
      high: number;
    };
  };
  regime: {
    quadrant: "range_bound" | "range_at_edge" | "trending" | "chop_whipsaw";
    label: string;
    rationale: string;
    /** 信念度:規則加總得出 (參考 GEXmon 的 conviction) */
    conviction?: "high" | "medium" | "low";
    /** 規則籤條:每條判定規則與加減分,攤開給使用者看,提升透明度 */
    signals?: Array<{ text: string; weight: number }>;
  };
  technicals: {
    overnight_high: number;
    overnight_low: number;
  };
  macro: {
    VIX: number;
    DXY: number;
    US10Y: number;
  };
  plan_notes: string[];
  data_mode?: DataMode;
  primary_source?: string;
  source_status?: DataSourceStatusBlock;
  cme_audit?: CmeAuditStatus;
  expiry_breakdown?: ExpiryGexSummary[];
  selected_expiry_panels?: ExpiryGexSummary[];
  tradingview_payloads?: TradingViewPayloads;
  session_monitor?: SessionMonitorState;
  playbook?: PlaybookOutput;
  confluence?: OfficialProxyConfluence;
  calculation_mode?: string;
  gross_gex?: number;
  total_net_gex?: number;
  top_abs_gex_strikes?: Array<{ strike: number; gex: number; rank: number }>;
  gex_display?: GexDisplayCalibration;
}

export type SourceState = "ok" | "failed" | "not_configured" | "not_attempted";

export interface SourceStatus {
  source: string;
  state: SourceState;
  isDelayed: boolean;
  delayNote: string;
  detail?: string;
  checkedAt: string;
}

export interface RefreshResult {
  success: boolean;
  date: string;
  sources: string[];
  warnings: string[];
  sourceStatus: SourceStatus[];
  persisted: boolean;
  refreshRunId?: string;
}

export interface ApplicationStatus {
  service: "ok" | "degraded" | "unconfigured" | "error";
  database: "connected" | "not_configured" | "error";
  persistence: "durable" | "memory_only";
  latestSnapshotDate: string | null;
  latestSnapshotTimestamp: string | null;
  lastRefresh?: RefreshResult | null;
  sourceStatus: SourceStatus[];
  warnings: string[];
}
