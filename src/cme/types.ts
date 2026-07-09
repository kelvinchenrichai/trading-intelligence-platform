export type CmeOptionType = "call" | "put";
export type ExpiryPrecision = "estimated" | "manual_override";

export interface CmeNqOptionContract {
  tradeDate: string;
  underlyingContract: string;
  optionFamily: string;
  optionCode: string | null;
  expiryLabel: string;
  expiryDate: string;
  expiryPrecision: ExpiryPrecision;
  optionType: CmeOptionType;
  strike: number;
  settlement: number | null;
  delta: number | null;
  openInterest: number;
  volume: number;
  sourcePage: number;
  rawRow: Record<string, string | number | null>;
}

export interface CmeExpirySummary {
  expiryLabel: string;
  expiryDate: string;
  expiryPrecision: ExpiryPrecision;
  optionFamily: string;
  callOpenInterest: number;
  putOpenInterest: number;
  totalOpenInterest: number;
  netDexProxy: number;
  topCallStrikes: Array<{ strike: number; openInterest: number }>;
  topPutStrikes: Array<{ strike: number; openInterest: number }>;
}

export interface CmeNqImportResult {
  tradeDate: string;
  bulletinDateText: string;
  parserVersion: string;
  underlyingContract: string;
  futuresSettlement: number;
  fileName: string;
  sha256: string;
  contractCount: number;
  expirySummaries: CmeExpirySummary[];
  warnings: string[];
  contracts: CmeNqOptionContract[];
}

export interface StoredCmeImport {
  id: string;
  tradeDate: string;
  underlyingContract: string;
  futuresSettlement: number;
  contractCount: number;
  fileName: string;
  createdAt: string;
  parserVersion?: string | null;
  sha256?: string | null;
  warnings: string[];
  summary: Omit<CmeNqImportResult, "contracts" | "fileName" | "sha256">;
}
