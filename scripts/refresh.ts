/** Run by Railway Cron: npm run refresh */
import "dotenv/config";
import { RealMarketDatabase } from "../src/db/realDatabase";
import { SupabaseStore } from "../src/db/supabaseStore";
import { MarketDataAppProvider } from "../src/providers/marketDataApp";
import { YahooFinanceProvider } from "../src/providers/yahooFinance";

async function main() {
  const yahoo = new YahooFinanceProvider();
  const primary = process.env.MARKETDATA_TOKEN?.trim() ? new MarketDataAppProvider() : yahoo;
  const secondary = process.env.MARKETDATA_TOKEN?.trim() ? yahoo : undefined;
  const store = SupabaseStore.fromEnvironment();
  if (!store) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for scheduled refreshes.");

  const db = new RealMarketDatabase({
    primary,
    secondary,
    maxExpiries: Number.parseInt(process.env.MAX_EXPIRIES || "4", 10),
    fredApiKey: process.env.FRED_API_KEY,
    store,
    marketDataConfigured: Boolean(process.env.MARKETDATA_TOKEN?.trim()),
  });
  await db.initialize();
  const result = await db.refresh();
  console.log(JSON.stringify(result, null, 2));
  if (!result.success || !result.persisted) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
