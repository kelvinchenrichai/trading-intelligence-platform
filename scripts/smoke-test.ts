/** Fast no-key test: validates the server can construct safe unconfigured state. */
import "dotenv/config";
import { RealMarketDatabase } from "../src/db/realDatabase";
import { YahooFinanceProvider } from "../src/providers/yahooFinance";

async function main() {
  const db = new RealMarketDatabase({ primary: new YahooFinanceProvider(), maxExpiries: 1 });
  await db.initialize();
  const status = db.getStatus();
  if (status.persistence !== "memory_only") throw new Error("Expected memory-only status without Supabase.");
  console.log("Smoke test passed:", JSON.stringify(status, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
