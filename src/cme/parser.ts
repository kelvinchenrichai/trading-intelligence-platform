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
export const CME_PARSER_VERSION = "cme-pg40-v0.3.0-optiontype-column-resolver";

type Word = { x: number; rawX: number; y: number; text: string; page: number; column: number };
type PdfLine = { y: number; page: number; column: number; words: Word[]; text: string };
type Context = {
  /** Human CME section name, for example E-MINI NASDAQ 100 WEEKLY-2 or DMQ MID. */
  family: string;
  optionType: CmeOptionType;
  optionCode: string | null;
  monthLabel: string | null;
  /** CALLS/PUTS section currently being parsed. ADDITIONAL sections mutate this per sub-code. */
  parentSection: string | null;
};

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

function weekdayFromFamily(familyUpper: string): number | null {
  if (/\bMON\b|MONDAY/.test(familyUpper)) return 1;
  if (/\bTUE\b|TUESDAY/.test(familyUpper)) return 2;
  if (/\bWED\b|WEDNESDAY|\bMID\b/.test(familyUpper)) return 3;
  if (/\bTHU\b|\bTHUR\b|THURSDAY/.test(familyUpper)) return 4;
  if (/\bFRI\b|FRIDAY/.test(familyUpper)) return 5;
  return null;
}

function dailySeriesWeekOffset(familyUpper: string): number {
  // CME PG40 lists daily Nasdaq option product codes in letter series.  The exact
  // exchange calendar remains a specialized contract-calendar problem, so this
  // transparent resolver maps the common Section 40 daily prefixes by observed
  // week bucket and flags all results as estimated.
  const code = familyUpper.match(/^([A-Z0-9]{2,4})\s+/)?.[1] || "";
  if (/^D/.test(code)) return 0; // current listed week
  if (/^Q/.test(code)) return 1; // following listed week
  if (/^R/.test(code)) return 2; // two weeks out
  return 0;
}

function addCalendarDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function inferExpiry(tradeDate: string, family: string, monthLabel: string | null): { expiryDate: string; precision: "estimated"; label: string } {
  const trade = new Date(`${tradeDate}T00:00:00Z`);
  const familyUpper = family.toUpperCase();
  const weeklyMatch = familyUpper.match(/WEEKLY-(\d)/);
  if (weeklyMatch) {
    return { expiryDate: isoDate(nthFridayFromTradeDate(tradeDate, Number(weeklyMatch[1]))), precision: "estimated", label: family };
  }
  const weekday = weekdayFromFamily(familyUpper);
  if (weekday !== null) {
    const first = nextWeekdayInclusive(trade, weekday);
    return { expiryDate: isoDate(addCalendarDays(first, dailySeriesWeekOffset(familyUpper) * 7)), precision: "estimated", label: family };
  }
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

function uniqueNumbers(values: number[], tolerance = 18): number[] {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    const last = out.at(-1);
    if (last === undefined || Math.abs(value - last) > tolerance) out.push(value);
  }
  return out;
}

function buildLines(words: Word[]): PdfLine[] {
  const ordered = words.filter((word) => word.text).sort((a, b) => a.page - b.page || a.column - b.column || a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const word of ordered) {
    const last = lines.at(-1);
    if (last && last.page === word.page && last.column === word.column && Math.abs(last.y - word.y) <= 0.7) {
      last.words.push(word);
      last.y = Math.min(last.y, word.y);
      continue;
    }
    lines.push({ y: word.y, page: word.page, column: word.column, words: [word], text: "" });
  }
  return lines.map((line) => {
    const sortedWords = line.words.sort((a, b) => a.x - b.x);
    return { ...line, words: sortedWords, text: sortedWords.map((word) => word.text).join(" ") };
  });
}

function parseBboxXml(xml: string): PdfLine[] {
  const lines: PdfLine[] = [];
  const pageRegex = /<page\s+([^>]*)>([\s\S]*?)(?=<page\b|<\/doc>|$)/gi;
  let pageMatch: RegExpExecArray | null;
  let pageIndex = 0;

  while ((pageMatch = pageRegex.exec(xml))) {
    pageIndex += 1;
    const pageBody = pageMatch[2];
    const rawWords: Array<Omit<Word, "x" | "column">> = [];
    const wordRegex = /<word\s+([^>]*)>([\s\S]*?)<\/word>/gi;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(pageBody))) {
      const attrs = match[1];
      const xMatch = attrs.match(/xMin="([^"]+)"/i);
      const yMatch = attrs.match(/yMin="([^"]+)"/i);
      if (!xMatch || !yMatch) continue;
      const text = unescapeHtml(match[2]).trim();
      if (!text) continue;
      rawWords.push({ rawX: Number(xMatch[1]), y: Number(yMatch[1]), text, page: pageIndex });
    }

    // CME PG40 can use two side-by-side tables on the same page.  The old parser
    // merged both physical columns into one y-line and only read x<50, silently
    // dropping the right table.  Use the STRIKE header positions as column anchors,
    // then normalize x inside each detected table column.
    const strikeAnchors = uniqueNumbers(
      rawWords.filter((word) => /^STRIKE$/i.test(word.text)).map((word) => word.rawX),
      35,
    );
    const anchors = strikeAnchors.length >= 2 ? strikeAnchors : [strikeAnchors[0] ?? 0];
    const normalized: Word[] = [];

    for (const word of rawWords) {
      let column = 0;
      for (let i = 0; i < anchors.length; i++) {
        const leftBoundary = i === 0 ? -Infinity : (anchors[i - 1] + anchors[i]) / 2;
        const rightBoundary = i === anchors.length - 1 ? Infinity : (anchors[i] + anchors[i + 1]) / 2;
        if (word.rawX >= leftBoundary && word.rawX < rightBoundary) {
          column = i;
          break;
        }
      }
      const anchor = anchors[column] ?? 0;
      normalized.push({ ...word, x: word.rawX - anchor, column });
    }

    lines.push(...buildLines(normalized));
  }

  return lines.sort((a, b) => a.page - b.page || a.y - b.y || a.column - b.column);
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

function optionTypeFromText(text: string, fallback: CmeOptionType = "call"): CmeOptionType {
  if (/\bP(?:UTS?)?\b/.test(text)) return "put";
  if (/\bC(?:ALLS?)?\b/.test(text)) return "call";
  return fallback;
}

function detectContext(line: PdfLine, current: Context | null): Context | null {
  const text = line.text.toUpperCase();
  // Main and auxiliary Section 40 tables.  v0.1 only caught E-MINI WEEKLY
  // headers, which missed ADDITIONAL NASDAQ daily/MID/THUR/WED/EOM sections
  // and caused the dashboard to collapse the CME universe to a few Friday
  // expirations.  Keep the matcher broad, but still exclude Russell/Micro rows
  // and let parseRow reject non-NQ strike scales (< 10,000).
  const startsWithContractMonth = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}\b/.test(text.trim());
  const isSectionHeader = !startsWithContractMonth && (
    /^\s*EMINI NASD\s+(CALL|PUT)\s*$/.test(text) ||
    /^(NASDAQ 100 WEEKLY-\d|E-MINI NASDAQ 100 WEEKLY-\d|ADDITIONAL NASDAQ|MINI NSDQ EOM)/.test(text)
  );
  if (isSectionHeader && /NASDAQ|NASD|NSDQ/.test(text) && !/RUSSELL|RTY|MICRO/.test(text) && /(CALLS?|PUTS?|\b[CP]\b|EOM)/.test(text)) {
    const optionType = optionTypeFromText(text, current?.optionType ?? "call");
    let family = text.replace(/\s+/g, " ").replace(/\s+(CALLS|PUTS)$/, "").replace(/\s+\b(CALL|PUT)\b.*$/, "").replace(/\s+[CP]\b.*$/, "").trim();
    if (/ADDITIONAL NASDAQ/.test(text)) family = "ADDITIONAL NASDAQ";
    if (/MINI NSDQ EOM\s+C\b/.test(text)) return { family: "MINI NSDQ EOM", optionType: "call", optionCode: "EOM", monthLabel: null, parentSection: text };
    if (/MINI NSDQ EOM\s+P\b/.test(text)) return { family: "MINI NSDQ EOM", optionType: "put", optionCode: "EOM", monthLabel: null, parentSection: text };
    return { family, optionType, optionCode: null, monthLabel: null, parentSection: text };
  }
  if (!current) return current;
  const joined = line.words.map((word) => word.text).join(" ").toUpperCase();
  const code = joined.match(/^\s*([A-Z0-9]{2,4})\s+(CALL|PUT|MID|MON|TUE|WED|THUR|THU)\b/);
  if (code && !/^(TOTAL|OPEN|HIGH|LOW|STRIKE)$/.test(code[1])) {
    const descriptor = code[2] === "THUR" ? "THUR" : code[2];
    const newType: CmeOptionType = code[2] === "PUT" ? "put" : code[2] === "CALL" ? "call" : current.optionType;
    return { ...current, optionType: newType, family: `${code[1]} ${descriptor}`, optionCode: code[1], monthLabel: null };
  }
  if (/^\s*MINI NSDQ EOM\s+[CP]\b/.test(joined)) {
    const newType: CmeOptionType = /\bP\b/.test(joined) ? "put" : "call";
    return { ...current, optionType: newType, family: "MINI NSDQ EOM", optionCode: "EOM", monthLabel: null };
  }
  const month = line.words.find((word) => word.x < 90 && /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}$/i.test(word.text))?.text;
  if (month) return { ...current, monthLabel: month.toUpperCase() };
  return current;
}

type ParsedRowResult = { row: CmeNqOptionContract | null; reason?: string };

function findNumericWordByOffset(words: Word[], originX: number, minOffset: number, maxOffset: number): Word | undefined {
  const candidates = words
    .filter((word) => {
      const offset = word.x - originX;
      return offset >= minOffset && offset <= maxOffset && /\d/.test(word.text);
    })
    .sort((a, b) => Math.abs(a.x - originX - (minOffset + maxOffset) / 2) - Math.abs(b.x - originX - (minOffset + maxOffset) / 2));
  return candidates[0];
}

function parseRowAtStrike(line: PdfLine, context: Context, tradeDate: string, underlyingContract: string, strikeWord: Word): ParsedRowResult {
  const strike = asNumber(strikeWord.text);
  if (!strike || strike < 10_000 || strike > 50_000) return { row: null, reason: "strike_out_of_range" };
  const x0 = strikeWord.x;
  const settlementWord = findNumericWordByOffset(line.words, x0, 220, 345);
  const deltaWord = findNumericWordByOffset(line.words, x0, 320, 430);
  const volumeWord = findNumericWordByOffset(line.words, x0, 385, 485);
  const oiWord = findNumericWordByOffset(line.words, x0, 445, 545);
  const settlement = asNumber(settlementWord?.text);
  const delta = asNumber(deltaWord?.text);
  const volume = asNumber(volumeWord?.text) ?? 0;
  const oi = asNumber(oiWord?.text);
  if (oi === null) return { row: null, reason: "missing_open_interest" };
  const inferred = inferExpiry(tradeDate, context.family, context.monthLabel);
  const sectionType = /WEEKLY-\d/.test(context.family)
    ? context.family.match(/WEEKLY-\d/)?.[0] || "WEEKLY"
    : /EOM/.test(context.family)
      ? "EOM"
      : weekdayFromFamily(context.family.toUpperCase()) !== null
        ? "DAILY"
        : "MONTHLY";
  return {
    row: {
      tradeDate,
      underlyingContract,
      optionFamily: context.family,
      optionCode: context.optionCode,
      expiryLabel: `${inferred.expiryDate} · ${sectionType} · ${context.monthLabel || "UNKNOWN"} · ${inferred.label}`,
      expiryDate: inferred.expiryDate,
      expiryPrecision: inferred.precision,
      optionType: context.optionType,
      strike,
      settlement,
      delta,
      openInterest: Math.round(oi),
      volume: Math.round(volume),
      sourcePage: line.page,
      rawRow: {
        text: line.text,
        page: line.page,
        column: line.column,
        xStrike: strikeWord.x,
        rawXStrike: strikeWord.rawX,
        settlementWord: settlementWord?.text || null,
        deltaWord: deltaWord?.text || null,
        volumeWord: volumeWord?.text || null,
        oiWord: oiWord?.text || null,
        sectionType,
        optionCode: context.optionCode,
        parentSection: context.parentSection,
      },
    },
  };
}

function parseLineRows(line: PdfLine, context: Context, tradeDate: string, underlyingContract: string): ParsedRowResult[] {
  // After column normalization, a valid strike is near the left side of that
  // physical table column.  This deliberately avoids interpreting OI/volume as
  // another strike when a two-column PDF row has been merged by the extractor.
  const strikeWords = line.words.filter((word) => {
    if (word.x < -45 || word.x > 130) return false;
    if (!/^\d{4,5}(?:\.\d+)?$/.test(word.text)) return false;
    const strike = asNumber(word.text);
    return !!strike && strike >= 10_000 && strike <= 50_000;
  });
  if (!strikeWords.length) return [{ row: null }];
  return strikeWords.map((strikeWord) => parseRowAtStrike(line, context, tradeDate, underlyingContract, strikeWord));
}

function summarize(contracts: CmeNqOptionContract[], futuresSettlement: number): CmeExpirySummary[] {
  const groups = new Map<string, CmeNqOptionContract[]>();
  // Group by actual resolved expiry date for audit summaries.  Multiple CME
  // sections can share one expiry (for example weekly + EOM + contract month).
  for (const contract of contracts) groups.set(contract.expiryDate, [...(groups.get(contract.expiryDate) || []), contract]);
  return [...groups.values()].map((group) => {
    const call = group.filter((row) => row.optionType === "call");
    const put = group.filter((row) => row.optionType === "put");
    const top = (rows: CmeNqOptionContract[]) => rows.sort((a, b) => b.openInterest - a.openInterest).slice(0, 5).map((row) => ({ strike: row.strike, openInterest: row.openInterest }));
    const netDexProxy = group.reduce((sum, row) => {
      const sign = row.optionType === "call" ? 1 : -1;
      return sum + sign * (row.delta ?? 0) * row.openInterest * 20 * futuresSettlement;
    }, 0);
    return {
      expiryLabel: Array.from(new Set(group.map((row) => row.expiryLabel))).slice(0, 4).join(" | "),
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

function countBy<T extends string | number>(items: CmeNqOptionContract[], pick: (item: CmeNqOptionContract) => T): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(pick(item));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export async function parseCmeSection40(pdfBuffer: Buffer, fileName: string): Promise<CmeNqImportResult> {
  if (pdfBuffer.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("Only PDF files are accepted.");
  const lines = await extractLines(pdfBuffer);
  if (!lines.some((line) => /PG40|NASDAQ 100 AND E-MINI NASDAQ 100 OPTIONS/i.test(line.text))) {
    throw new Error("This is not CME Daily Bulletin Section 40. Download the 'Nasdaq 100 and E-mini Nasdaq 100 Options - PG 40' PDF.");
  }
  const bulletin = parseBulletinDate(lines);
  const future = findFutureSettlement(lines);
  const contextByColumn = new Map<string, Context | null>();
  let lastAnyContext: Context | null = null;
  const contracts: CmeNqOptionContract[] = [];
  const rejectedRowReasons: Record<string, number> = {};
  for (const line of lines) {
    const contextKey = String(line.column);
    const previous = contextByColumn.get(contextKey) ?? lastAnyContext;
    const context = detectContext(line, previous);
    contextByColumn.set(contextKey, context);
    if (context) lastAnyContext = context;
    if (!context) continue;
    const results = parseLineRows(line, context, bulletin.date, future.contract);
    for (const result of results) {
      if (result.row) {
        contracts.push(result.row);
      } else if (result.reason) {
        rejectedRowReasons[result.reason] = (rejectedRowReasons[result.reason] || 0) + 1;
      }
    }
  }
  const deduped = [...new Map(contracts.map((contract) => [`${contract.optionFamily}|${contract.optionType}|${contract.expiryLabel}|${contract.strike}|${contract.sourcePage}|${contract.rawRow.column}`, contract])).values()];
  if (deduped.length < 100) throw new Error(`Parser found only ${deduped.length} NQ option rows. The PDF format may have changed; do not use this import for analysis.`);
  const debugAudit = {
    pdfPageCount: Math.max(...lines.map((line) => line.page), 0),
    extractedLineCount: lines.length,
    rawParsedRowCount: contracts.length,
    dedupedRowCount: deduped.length,
    parsedRowCountByPage: countBy(deduped, (row) => row.sourcePage),
    parsedRowCountByOptionFamily: countBy(deduped, (row) => `${row.optionFamily} · ${row.optionType}`),
    parsedRowCountByExpiryDate: countBy(deduped, (row) => row.expiryDate),
    rejectedRowReasons,
  };
  const warnings = [
    "CME PDF is user-uploaded; this platform does not automatically download or scrape CME data.",
    "Weekly/daily expiry dates are model estimates until an exact contract-calendar resolver is validated. Do not treat preliminary gamma metrics as final trading signals.",
    "CME PG40 v5 parser stores CME OI, settlement, volume, CME-published delta, and full-expiry audit rows. Black-76 GEX and comparable display calibration are computed after import.",
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
    debugAudit,
    contracts: deduped,
  };
}
