/** Trading Intelligence Platform API server. */
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { createServer as createViteServer } from "vite";
import { RealMarketDatabase } from "./src/db/realDatabase";
import { SupabaseStore } from "./src/db/supabaseStore";
import { MarketDataAppProvider } from "./src/providers/marketDataApp";
import { YahooFinanceProvider } from "./src/providers/yahooFinance";
import { CmeImportService } from "./src/cme/service";
import { parseCmeSection40 } from "./src/cme/parser";

async function buildDatabase(): Promise<RealMarketDatabase> {
  const yahoo = new YahooFinanceProvider();
  const hasMarketDataToken = Boolean(process.env.MARKETDATA_TOKEN?.trim());
  const primary = hasMarketDataToken ? new MarketDataAppProvider() : yahoo;
  const secondary = hasMarketDataToken ? yahoo : undefined;
  const store = SupabaseStore.fromEnvironment();
  const database = new RealMarketDatabase({
    primary,
    secondary,
    maxExpiries: Number.parseInt(process.env.MAX_EXPIRIES || "4", 10),
    fredApiKey: process.env.FRED_API_KEY,
    store,
    marketDataConfigured: hasMarketDataToken,
  });
  await database.initialize();
  console.info(`[startup] primary=${primary.sourceName}; secondary=${secondary?.sourceName || "none"}; persistence=${store ? "Supabase" : "memory-only"}`);
  return database;
}

function isPublicRefreshAllowed(): boolean {
  return process.env.ALLOW_PUBLIC_MANUAL_REFRESH === "true";
}

function refreshAuthorized(req: express.Request): boolean {
  if (isPublicRefreshAllowed()) return true;
  const expected = process.env.REFRESH_API_TOKEN;
  return Boolean(expected && req.get("x-refresh-token") === expected);
}

async function startServer() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 4 }, fileFilter: (_req, file, callback) => {
    const allowed = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (allowed) callback(null, true);
    else callback(new Error("Only PDF uploads are accepted."));
  } });
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");

  const database = await buildDatabase();
  const cmeImports = new CmeImportService(SupabaseStore.fromEnvironment());

  app.get("/api/health", (_req, res) => {
    const status = database.getStatus();
    const code = status.service === "error" ? 503 : 200;
    res.status(code).json(status);
  });

  app.get("/api/instruments", (_req, res) => res.json(database.getInstrumentsLegacyShape()));

  app.get("/api/cme/imports", async (_req, res) => {
    try { return res.json(await cmeImports.list()); }
    catch (error: any) { return res.status(503).json({ error: error?.message || "Unable to load CME import history.", code: "CME_STORE_ERROR" }); }
  });

  app.post("/api/cme/import", upload.single("bulletin"), async (req, res) => {
    if (process.env.CME_PG40_IMPORT_ENABLED === "false") return res.status(404).json({ error: "CME import is disabled.", code: "CME_IMPORT_DISABLED" });
    if (!refreshAuthorized(req)) return res.status(403).json({ error: "CME import is protected. Enter your private Refresh Token.", code: "CME_IMPORT_FORBIDDEN" });
    if (!cmeImports.configured) return res.status(503).json({ error: "Supabase is required before importing a CME bulletin.", code: "CME_STORE_NOT_CONFIGURED" });
    if (!req.file?.buffer) return res.status(400).json({ error: "Missing PDF file field 'bulletin'.", code: "CME_FILE_MISSING" });
    try {
      const parsed = await parseCmeSection40(req.file.buffer, req.file.originalname);
      const stored = await cmeImports.persist(parsed);
      return res.status(201).json({ ...stored, tradeDate: parsed.tradeDate, contractCount: parsed.contractCount, expirySummaries: parsed.expirySummaries, warnings: parsed.warnings });
    } catch (error: any) {
      console.error("[cme-import]", error?.message || error);
      return res.status(422).json({ error: error?.message || "CME PDF could not be parsed.", code: "CME_PARSE_FAILED" });
    }
  });

  app.get("/api/daily-report", async (req, res) => {
    const instrument = String(req.query.instrument || "").toUpperCase();
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    if (!instrument) return res.status(400).json({ error: "Missing instrument parameter", code: "BAD_REQUEST" });
    try {
      const report = await database.getDailyReport(instrument, date);
      if (!report) {
        return res.status(503).json({
          error: "No verified snapshot is available yet. Run the protected refresh job after configuring data sources.",
          code: "NO_SNAPSHOT",
          status: database.getStatus(),
        });
      }
      return res.json(report);
    } catch (error: any) {
      return res.status(503).json({ error: error?.message || "Unable to read report", code: "DATA_STORE_ERROR", status: database.getStatus() });
    }
  });

  app.get("/api/reconciliation", async (req, res) => {
    const proxy = String(req.query.proxy || "").toUpperCase();
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    if (!proxy || !date) return res.status(400).json({ error: "Missing proxy or date parameter", code: "BAD_REQUEST" });
    try {
      return res.json(await database.getReconciliation(proxy, date));
    } catch (error: any) {
      return res.status(503).json({ error: error?.message || "Unable to read reconciliation", code: "DATA_STORE_ERROR" });
    }
  });

  app.get("/api/history", async (req, res) => {
    const instrument = String(req.query.instrument || "").toUpperCase();
    if (!instrument) return res.status(400).json({ error: "Missing instrument parameter", code: "BAD_REQUEST" });
    try {
      return res.json(await database.getHistory(instrument));
    } catch (error: any) {
      return res.status(503).json({ error: error?.message || "Unable to read history", code: "DATA_STORE_ERROR" });
    }
  });

  app.post("/api/trigger-scrape", async (req, res) => {
    if (!refreshAuthorized(req)) {
      return res.status(403).json({
        error: "Manual refresh is disabled. Use the Railway Cron service or set ALLOW_PUBLIC_MANUAL_REFRESH=true only for short private testing.",
        code: "REFRESH_FORBIDDEN",
      });
    }
    try {
      const result = await database.refresh();
      return res.status(result.success ? 200 : 503).json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to refresh data", code: "REFRESH_FAILED" });
    }
  });

  if (process.env.AUTO_REFRESH_ON_START === "true") {
    database.refresh().then((result) => {
      console.info(`[startup] refresh ${result.success ? "completed" : "did not complete"}: ${result.date}`);
    }).catch((error) => console.error("[startup] refresh exception", error));
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Trading Intelligence Platform listening on ${PORT}`));
}

startServer().catch((error) => {
  console.error("Fatal server startup error", error);
  process.exit(1);
});
