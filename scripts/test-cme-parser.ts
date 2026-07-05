import { readFileSync } from "fs";
import { parseCmeSection40 } from "../src/cme/parser";

const samplePath = process.env.CME_SAMPLE_PDF;
if (!samplePath) {
  console.log("[cme-parser] skipped: set CME_SAMPLE_PDF=/path/to/Section40.pdf to run the parser fixture.");
  process.exit(0);
}

(async () => {
  const parsed = await parseCmeSection40(readFileSync(samplePath), "fixture.pdf");
  if (parsed.contractCount < 100) throw new Error(`Expected at least 100 NQ contracts, received ${parsed.contractCount}.`);
  if (!/^NQ[HMUZ]\d{4}$/.test(parsed.underlyingContract)) throw new Error(`Unexpected NQ contract: ${parsed.underlyingContract}`);
  if (!(parsed.futuresSettlement > 10_000)) throw new Error(`Unexpected NQ settlement: ${parsed.futuresSettlement}`);
  console.log(JSON.stringify({
    status: "ok",
    tradeDate: parsed.tradeDate,
    underlyingContract: parsed.underlyingContract,
    futuresSettlement: parsed.futuresSettlement,
    contractCount: parsed.contractCount,
    expiryGroups: parsed.expirySummaries.length,
  }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
