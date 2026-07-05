/**
 * CME Daily Bulletin Section 40 parser for E-mini Nasdaq-100 options on futures.
 *
 * Design goals:
 * - Requires a user-uploaded official PDF. It never downloads or scrapes CME.
 * - Uses Poppler's coordinate-preserving `pdftotext -bbox` output, because a normal
 *   text extraction merges columns in CME's Crystal Reports PDFs.
 * - Keeps expiry dates explicitly marked as estimated unless the user supplies an
 *   override. This prevents an estimated weekly expiry from masquerading as official.
 */
import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { CmeExpirySummary, CmeNqImportResult, CmeNqOptionContract, CmeOptionType } from "./types";

const execFileAsync = promisify(execFile);
export const CME_PARSER_VERSION = "cme-pg40-v0.1.0";

type Word = { x: number; y: number; text: string; page: number };
type PdfLine = { y: number; page: number; words: Word[]; text: string };
type Context = { family: string; optionType: CmeOptionType; optionCode: string | null; monthLabel: string | null };

const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function unescapeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function asNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[ABN*#]/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const result = Number(match[0]);
  return Number.isFinite(result) ? result : null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseBulletinDate(lines: PdfLine[]): { date: string; text: string } {
  const matched = lines.map((line) => line.text).join("\n").match(/(?:Mon|Tue|Wed|Thu|Fri),\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2}),\s+(\d{4})/);
  if (!matched) throw new Error("This PDF does not expose a CME bulletin date. Upload CME Daily Bulletin Section 40 (PG40).");
  const [, mon, day, year] = matched;
  const date = new Date(Date.UTC(Number(year), MONTHS[mon.toUpperCase()], Number(day)));
  return { date: isoDate(date), text: matched[0] };
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function nextWeekdayInclusive(from: Date, weekday: number): Date {
  const d = new Date(from);
  const current = d.getUTCDay();
  const delta = (weekday - current + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function nthFridayFromTradeDate(tradeDate: string, n: number): Date {
  const start = new Date(`${tradeDate}T00:00:00Z`);
  const friday = nextWeekdayInclusive(start, 5);
  friday.setUTCDate(friday.getUTCDate() + (n - 1) * 7);
  return friday;
}

function lastBusinessDay(year: number, monthZeroBased: number): Date {
  const d = new Date(Date.UTC(year, monthZeroBased + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function thirdFriday(year: number, monthZeroBased: number): Date {
  const first = new Date(Date.UTC(year, monthZeroBased, 1));
  const firstFridayOffset = (5 - first.getUTCDay() + 7) % 7;
  first.setUTCDate(1 + firstFridayOffset + 14);
  return first;
}

function inferExpiry(tradeDate: string, family: string, monthLabel: string | null): { expiryDate: string; precision: "estimated"; label: string } {
  const trade = new Date(`${tradeDate}T00:00:00Z`);
  const familyUpper = family.toUpperCase();
  const weeklyMatch = familyUpper.match(/WEEKLY-(\d)/);
  if (weeklyMatch) {
    return { expiryDate: isoDate(nthFridayFromTradeDate(tradeDate, Number(weeklyMatch[1]))), precision: "estimated", label: family };
  }
  if (/\bMON\b|MONDAY/.test(familyUpper)) return { expiryDate: isoDate(nextWeekdayInclusive(trade, 1)), precision: "estimated", label: family };
  if (/\bTUE\b|TUESDAY/.test(familyUpper)) return { expiryDate: isoDate(nextWeekdayInclusive(trade, 2)), precision: "estimated", label: family };
  if (/\bWED\b|WEDNESDAY|MID/.test(familyUpper)) return { expiryDate: isoDate(nextWeekdayInclusive(trade, 3)), precision: "estimated", label: family };
  if (/\bTHU\b|THURSDAY/.test(familyUpper)) return { expiryDate: isoDate(nextWeekdayInclusive(trade, 4)), precision: "estimated", label: family };
  if (monthLabel && /EOM|END OF MONTH/.test(familyUpper)) {
    const mon = MONTHS[monthLabel.slice(0, 3)];
    const year = 2000 + Number(monthLabel.slice(3));
    return { expiryDate: isoDate(lastBusinessDay(year, mon)), precision: "estimated", label: family };
  }
  if (monthLabel) {
    const mon = MONTHS[monthLabel.slice(0, 3)];
    const year = 2000 + Number(monthLabel.slice(3));
    return { expiryDate: isoDate(thirdFriday(year, mon)), precision: "estimated", label: family };
  }
  return { expiryDate: isoDate(addBusinessDays(trade, 1)), precision: "estimated", label: family };
}

function parseBboxXml(xml: string): PdfLine[] {
  const words: Word[] = [];
  const pageParts = xml.split(/<page\b[^>]*>/i).slice(1);
  pageParts.forEach((pagePart, pageIndex) => {
    const wordRegex = /<word\s+([^>]*)>([\s\S]*?)<\/word>/gi;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(pagePart))) {
      const attrs = match[1];
      const xMatch = attrs.match(/xMin="([^"]+)"/i);
      const yMatch = attrs.match(/yMin="([^"]+)"/i);
      if (!xMatch || !yMatch) continue;
      words.push({ x: Number(xMatch[1]), y: Number(yMatch[1]), text: unescapeHtml(match[2]).trim(), page: pageIndex + 1 });
    }
  });
  const ordered = words.filter((word) => word.text).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const word of ordered) {
    const last = lines.at(-1);
    if (last && last.page === word.page && Math.abs(last.y - word.y) <= 0.7) {
      last.words.push(word);
      last.y = Math.min(last.y, word.y);
      continue;
    }
    lines.push({ y: word.y, page: word.page, words: [word], text: "" });
  }
  return lines.map((line) => ({ ...line, words: line.words.sort((a, b) => a.x - b.x), text: line.words.sort((a, b) => a.x - b.x).map((word) => word.text).join(" ") }));
}

async function extractLines(pdfBuffer: Buffer): Promise<PdfLine[]> {
  const nonce = randomUUID();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cme-pg40-${nonce}-`));
  const input = path.join(root, "bulletin.pdf");
  const output = path.join(root, "bulletin.xhtml");
  try {
    await fs.writeFile(input, pdfBuffer, { mode: 0o600 });
    await execFileAsync("pdftotext", ["-bbox", input, output], { timeout: 45_000, maxBuffer: 30 * 1024 * 1024 });
    return parseBboxXml(await fs.readFile(output, "utf8"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function findFutureSettlement(lines: PdfLine[]): { contract: string; settlement: number } {
  const start = lines.findIndex((line) => /EMINI NASD FUT/i.test(line.text));
  if (start < 0) throw new Error("Could not find the EMINI NASD FUT settlement section in Section 40.");
  for (const line of lines.slice(start + 1, start + 30)) {
    const contract = line.words.find((word) => word.x < 55 && /^(MAR|JUN|SEP|DEC)\d{2}$/i.test(word.text))?.text;
    if (!contract) continue;
    const settlementWord = line.words.find((word) => word.x >= 270 && word.x <= 320 && /\d/.test(word.text));
    const settlement = asNumber(settlementWord?.text);
    if (settlement && contract) {
      const month = contract.slice(0, 3).toUpperCase();
      const year = 2000 + Number(contract.slice(3));
      const code = `${month === "MAR" ? "H" : month === "JUN" ? "M" : month === "SEP" ? "U" : "Z"}${year}`;
      return { contract: `NQ${code}`, settlement };
    }
  }
  throw new Error("Could not parse the front E-mini Nasdaq futures settlement.");
}

function detectContext(line: PdfLine, current: Context | null): Context | null {
  const text = line.text.toUpperCase();
  if (/NASDAQ/.test(text) && !/RUSSELL|MICRO/.test(text) && /(CALLS|PUTS)/.test(text) && /(E-MINI|MINI NSDQ)/.test(text)) {
    const optionType: CmeOptionType = /PUTS/.test(text) ? "put" : "call";
    const family = text.replace(/\s+/g, " ").replace(/\s+(CALLS|PUTS)$/, "").trim();
    return { family, optionType, optionCode: current?.optionCode || null, monthLabel: null };
  }
  if (!current) return current;
  const code = line.words.map((word) => word.text).join(" ").match(/\b([A-Z0-9]{2,4})\s+(CALL|PUT|MID|MON|TUE|WED|THU)\b/);
  if (code && /^(Q|N)/.test(code[1])) return { ...current, optionCode: code[1] };
  const month = line.words.find((word) => word.x < 60 && /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}$/i.test(word.text))?.text;
  if (month) return { ...current, monthLabel: month.toUpperCase() };
  return current;
}

function parseRow(line: PdfLine, context: Context, tradeDate: string, underlyingContract: string): CmeNqOptionContract | null {
  const strikeWord = line.words.find((word) => word.x < 50 && /^\d{4,5}(?:\.\d+)?$/.test(word.text));
  if (!strikeWord) return null;
  const strike = asNumber(strikeWord.text);
  if (!strike || strike < 10_000 || strike > 50_000) return null;
  const settlement = asNumber(line.words.find((word) => word.x >= 290 && word.x < 350)?.text);
  const delta = asNumber(line.words.find((word) => word.x >= 365 && word.x < 410)?.text);
  const volume = asNumber(line.words.find((word) => word.x >= 425 && word.x < 468)?.text) ?? 0;
  const oi = asNumber(line.words.find((word) => word.x >= 468 && word.x < 505)?.text);
  if (oi === null) return null;
  const inferred = inferExpiry(tradeDate, context.family, context.monthLabel);
  return {
    tradeDate,
    underlyingContract,
    optionFamily: context.family,
    optionCode: context.optionCode,
    expiryLabel: `${context.monthLabel || "UNKNOWN"} · ${inferred.label}`,
    expiryDate: inferred.expiryDate,
    expiryPrecision: inferred.precision,
    optionType: context.optionType,
    strike,
    settlement,
    delta,
    openInterest: Math.round(oi),
    volume: Math.round(volume),
    sourcePage: line.page,
    rawRow: { text: line.text, page: line.page, xStrike: strikeWord.x, settlementWord: line.words.find((word) => word.x >= 290 && word.x < 350)?.text || null },
  };
}

function summarize(contracts: CmeNqOptionContract[], futuresSettlement: number): CmeExpirySummary[] {
  const groups = new Map<string, CmeNqOptionContract[]>();
  for (const contract of contracts) groups.set(contract.expiryLabel, [...(groups.get(contract.expiryLabel) || []), contract]);
  return [...groups.values()].map((group) => {
    const call = group.filter((row) => row.optionType === "call");
    const put = group.filter((row) => row.optionType === "put");
    const top = (rows: CmeNqOptionContract[]) => rows.sort((a, b) => b.openInterest - a.openInterest).slice(0, 5).map((row) => ({ strike: row.strike, openInterest: row.openInterest }));
    const netDexProxy = group.reduce((sum, row) => {
      const sign = row.optionType === "call" ? 1 : -1;
      return sum + sign * (row.delta ?? 0) * row.openInterest * 20 * futuresSettlement;
    }, 0);
    return {
      expiryLabel: group[0].expiryLabel,
      expiryDate: group[0].expiryDate,
      expiryPrecision: group[0].expiryPrecision,
      optionFamily: group[0].optionFamily,
      callOpenInterest: call.reduce((sum, row) => sum + row.openInterest, 0),
      putOpenInterest: put.reduce((sum, row) => sum + row.openInterest, 0),
      totalOpenInterest: group.reduce((sum, row) => sum + row.openInterest, 0),
      netDexProxy: Math.round(netDexProxy),
      topCallStrikes: top(call),
      topPutStrikes: top(put),
    };
  }).sort((a, b) => b.totalOpenInterest - a.totalOpenInterest);
}

export async function parseCmeSection40(pdfBuffer: Buffer, fileName: string): Promise<CmeNqImportResult> {
  if (pdfBuffer.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("Only PDF files are accepted.");
  const lines = await extractLines(pdfBuffer);
  if (!lines.some((line) => /PG40|NASDAQ 100 AND E-MINI NASDAQ 100 OPTIONS/i.test(line.text))) {
    throw new Error("This is not CME Daily Bulletin Section 40. Download the 'Nasdaq 100 and E-mini Nasdaq 100 Options - PG 40' PDF.");
  }
  const bulletin = parseBulletinDate(lines);
  const future = findFutureSettlement(lines);
  let context: Context | null = null;
  const contracts: CmeNqOptionContract[] = [];
  for (const line of lines) {
    context = detectContext(line, context);
    if (!context) continue;
    const row = parseRow(line, context, bulletin.date, future.contract);
    if (row) contracts.push(row);
  }
  const deduped = [...new Map(contracts.map((contract) => [`${contract.optionFamily}|${contract.optionType}|${contract.expiryLabel}|${contract.strike}|${contract.sourcePage}`, contract])).values()];
  if (deduped.length < 100) throw new Error(`Parser found only ${deduped.length} NQ option rows. The PDF format may have changed; do not use this import for analysis.`);
  const warnings = [
    "CME PDF is user-uploaded; this platform does not automatically download or scrape CME data.",
    "Weekly/daily expiry dates are model estimates until an exact contract-calendar resolver is validated. Do not treat preliminary gamma metrics as final trading signals.",
    "This first importer stores CME OI, settlement, volume, and CME-published delta. Black-76 GEX calibration is intentionally a separate validation step.",
  ];
  return {
    tradeDate: bulletin.date,
    bulletinDateText: bulletin.text,
    parserVersion: CME_PARSER_VERSION,
    underlyingContract: future.contract,
    futuresSettlement: future.settlement,
    fileName,
    sha256: createHash("sha256").update(pdfBuffer).digest("hex"),
    contractCount: deduped.length,
    expirySummaries: summarize(deduped, future.settlement),
    warnings,
    contracts: deduped,
  };
}
