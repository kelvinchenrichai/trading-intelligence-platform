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

export interface DailyReport {
  instrument: string;
  proxy: string;
  enabled: boolean;
  as_of: string;
  data_confidence: "high" | "medium" | "low";
  gamma: {
    status: "positive" | "negative";
    flip_level: number;
    call_walls: Array<{ strike: number; rank: number; gex: number }>;
    put_walls: Array<{ strike: number; rank: number; gex: number }>;
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
