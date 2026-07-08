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
  // 預設允許手動刷新 (刷新按鈕在前端已限 admin 才看得到)。
  // 若要關閉,明確設 ALLOW_PUBLIC_MANUAL_REFRESH=false。
  return process.env.ALLOW_PUBLIC_MANUAL_REFRESH !== "false";
}

function refreshAuthorized(req: express.Request): boolean {
  if (isPublicRefreshAllowed()) return true;
  const expected = process.env.REFRESH_API_TOKEN;
  return Boolean(expected && req.get("x-refresh-token") === expected);
}


const TV_EVENTS = new Set([
  "GAMMA_FLIP_TOUCH",
  "GAMMA_FLIP_RECLAIM",
  "GAMMA_FLIP_REJECT",
  "CALL_WALL_TOUCH",
  "CALL_WALL_BREAKOUT_2X5M",
  "PUT_WALL_TOUCH",
  "PUT_WALL_BREAKDOWN_2X5M",
  "WALL_FLIPPED_SUPPORT",
  "WALL_FLIPPED_RESISTANCE",
  "BOS_UP",
  "BOS_DOWN",
  "AVWAP_RECLAIM",
  "AVWAP_REJECT",
  "CONFLUENCE_ZONE_ENTER",
]);

function tradingViewAuthorized(payload: any, req: express.Request): boolean {
  const expected = process.env.TV_WEBHOOK_SECRET || process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected) return false;
  return payload?.secret === expected || req.get("x-tv-secret") === expected;
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

  // 提供前端「執行時」讀取 Supabase 設定 (避免依賴 build 階段的 VITE_ 變數)。
  // 這些都是可公開的前端設定 (publishable key / 網址),不含任何後端 secret。
  // 優先讀 VITE_ 前綴,若沒設則退回同名的一般環境變數,兩種設法都能運作。
  app.get("/api/config", (_req, res) => {
    res.json({
      supabaseUrl:
        process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabaseAnonKey:
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        "",
      adminEmails: (
        process.env.VITE_ADMIN_EMAILS ||
        process.env.ADMIN_EMAILS ||
        "kelvinchen20000108@gmail.com"
      ),
    });
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


  app.post("/api/tradingview/webhook", async (req, res) => {
    const payload = req.body || {};
    if (!tradingViewAuthorized(payload, req)) {
      return res.status(403).json({ ok: false, error: "Invalid or missing TradingView webhook secret.", code: "TV_WEBHOOK_FORBIDDEN" });
    }
    if (!TV_EVENTS.has(payload.event)) {
      return res.status(400).json({ ok: false, error: `Unsupported TradingView event: ${payload.event || "missing"}`, code: "TV_EVENT_UNSUPPORTED" });
    }
    const store = SupabaseStore.fromEnvironment();
    if (!store) return res.status(503).json({ ok: false, error: "Supabase is required for TradingView webhook persistence.", code: "TV_STORE_NOT_CONFIGURED" });
    try {
      await store.persistTradingViewEvent(payload);
      const state = await store.getTradingViewSessionState(payload.modelDate || payload.model_date, payload.underlying);
      return res.json({ ok: true, state });
    } catch (error: any) {
      console.error("[tradingview-webhook]", error?.message || error);
      return res.status(503).json({ ok: false, error: error?.message || "Unable to persist TradingView webhook event.", code: "TV_STORE_ERROR" });
    }
  });

  app.get("/api/tradingview/session", async (req, res) => {
    const modelDate = typeof req.query.modelDate === "string" ? req.query.modelDate : "";
    const underlying = typeof req.query.underlying === "string" ? req.query.underlying : undefined;
    if (!modelDate) return res.status(400).json({ error: "Missing modelDate parameter", code: "BAD_REQUEST" });
    const store = SupabaseStore.fromEnvironment();
    if (!store) return res.status(503).json({ error: "Supabase is required for TradingView session state.", code: "TV_STORE_NOT_CONFIGURED" });
    try {
      return res.json(await store.getTradingViewSessionState(modelDate, underlying));
    } catch (error: any) {
      return res.status(503).json({ error: error?.message || "Unable to load TradingView session state", code: "TV_STORE_ERROR" });
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
