# Trading Intelligence Platform — 部署與測試手冊

本版本是 **私人研究工具**：以 NDX / SPX options 作為 NQ / ES 的 proxy，使用延遲／EOD 的公開 OI 資料建立 Gamma 結構模型。它不是即時 OPRA 期權終端，不含付款、會員、暗池資料或盤中通知。

## 0. 部署完成後你會得到什麼

- 一個 Railway 網址，可查看 NQ / ES 每日結構快照。
- MarketData.app + Yahoo Finance 備援 + FRED 宏觀資料的擷取流程。
- Supabase 保存報告、原始 Option Contracts、核對帳本、宏觀資料與歷史資料。
- `/api/health` 顯示資料庫、資料源、最後成功快照與 warning。
- 一個 Railway Cron service，在工作日自動跑 `node dist/refresh.cjs` 後退出。

## 1. 先把本專案上傳到 GitHub

1. 解壓本檔案。
2. 建立新的 private GitHub repository，例如 `trading-intelligence-platform`。
3. 把**所有檔案（包含 `supabase/001_initial_schema.sql`、`Dockerfile`、`railway.toml`、`railway.cron.toml`）**上傳。
4. 確認 `.env` 沒有被上傳；repository 內只應有 `.env.example`。

## 2. 建立 Supabase 資料庫

1. 在 Supabase 建立新 Project。
2. 進入 **SQL Editor** → New query。
3. 開啟專案內的 `supabase/001_initial_schema.sql`，完整複製貼上後按 Run。
4. 到 **Project Settings / API Keys** 或 Connect 頁面複製：
   - `SUPABASE_URL`
   - **Secret key**（新 key 格式通常是 `sb_secret_...`）
5. 不要使用 Publishable key；本專案的資料庫 key 只在 Railway 後端使用。

> SQL 已對所有表啟用 RLS。後端會以 Supabase Secret / legacy service-role key 存取；此 key 絕不能寫進前端、Vite 環境變數、GitHub 或聊天截圖。

## 3. 準備資料 API

你需要：

```env
MARKETDATA_TOKEN=你的 MarketData.app token
FRED_API_KEY=你的 FRED key
```

建議一開始 `MAX_EXPIRIES=3` 或 `4`。這是控制每次只抓最近幾個到期日，不是即時模式。

## 4. 建立 Railway 網站服務

1. Railway → New Project → Deploy from GitHub Repo。
2. 選擇本 repository。
3. Railway 會讀到根目錄的 `Dockerfile` 及 `railway.toml`。
4. 到服務的 **Variables**，新增下列變數：

```env
NODE_ENV=production
APP_URL=https://部署後的網址
MARKETDATA_TOKEN=...
FRED_API_KEY=...
MAX_EXPIRIES=4
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
AUTO_REFRESH_ON_START=false
ALLOW_PUBLIC_MANUAL_REFRESH=true
```

第一輪私測時，暫時設定：

```env
ALLOW_PUBLIC_MANUAL_REFRESH=true
```

這樣你能直接從網站按「更新 EOD 快照」。**完成第一輪測試後，務必改回 `false`**，避免任何訪客消耗你的資料 API 額度。

5. 按 Deploy，等待 Healthcheck 通過。
6. 開啟 Railway 的 Public Networking / Generate Domain，取得網址。

## 5. 第一輪測試順序

1. 打開：

```text
https://你的網域/api/health
```

理想狀態：

```json
{
  "database": "connected",
  "persistence": "durable"
}
```

2. 開啟首頁。尚未抓資料前，畫面應顯示「尚無可用的資料快照」，而不是假資料。
3. 點「更新 EOD 快照」。
4. 等待完成後，確認畫面顯示：
   - NQ / ES 報告
   - 日期
   - `PERSISTED`
   - Audit 表內的 MarketData.app / Yahoo Finance 真實欄位
5. 回到 Supabase → Table Editor，確認下列 table 有資料：

```text
refresh_runs
daily_reports
reconciliation_records
macro_snapshots
option_contracts
```

6. 在 Railway Logs 查看是否有市場資料或 Supabase 錯誤。若資料源取得失敗，網站與 `/api/health` 都會顯示 warning；請不要把空白結果當成交易訊號。

## 6. 加入每日 Railway Cron（測試成功後）

建立第二個 Railway Service，仍然連到**同一個 GitHub repository**。

1. 到第二個 service 的 Settings，將 config file path 設為：

```text
/railway.cron.toml
```

2. 確認 Start Command 是：

```text
node dist/refresh.cjs
```

3. 將第一個網站服務的 Variables 原封不動複製到 Cron service，至少要有：

```env
MARKETDATA_TOKEN
FRED_API_KEY
MAX_EXPIRIES
SUPABASE_URL
SUPABASE_SECRET_KEY
NODE_ENV=production
```

4. Cron schedule 使用專案提供的：

```text
0 17 * * 1-5
```

這是週一到週五 **17:00 UTC**。以目前目標來說，它是在取得前一交易日 EOD/延遲資料後做每日快照；不是盤中即時資料。Railway cron 使用 crontab；時間請以 Railway 服務頁顯示的時區／下一次執行時間為準。

5. 將網站服務的：

```env
ALLOW_PUBLIC_MANUAL_REFRESH=false
```

6. 保留 `AUTO_REFRESH_ON_START=false`，避免網站重啟時意外重複消耗 API 額度。

## 7. 重要 API 行為

| Endpoint | 用途 | 正常／失敗行為 |
|---|---|---|
| `/api/health` | 部署、資料庫與最後快照狀態 | 沒有資料時仍回傳可讀狀態 |
| `/api/daily-report?instrument=NQ` | 讀取已保存報告 | 沒有快照會回 503 + `NO_SNAPSHOT` |
| `/api/history?instrument=NQ` | 讀取歷史快照 | 從 Supabase 讀取 |
| `/api/reconciliation?proxy=NDX&date=YYYY-MM-DD` | Audit ledger | 顯示真實 provider 欄位 |
| `POST /api/trigger-scrape` | 私測用手動刷新 | 預設被保護；只在 `ALLOW_PUBLIC_MANUAL_REFRESH=true` 時開放 |

## 8. 本機開發（可選）

```bash
cp .env.example .env
# 填入必要 key
npm ci
npm run dev
```

測試：

```bash
npm run lint
npm run build
npm run test:smoke
```

正式 EOD 刷新命令：

```bash
npm run refresh
```

## 9. 出現問題時怎麼看

### `/api/health` 是 `memory_only`

Supabase 環境變數缺少、key 錯誤，或 SQL migration 沒有執行。確認 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`。

### `NO_SNAPSHOT`

代表目前還沒有成功保存的真實資料。請先檢查 Railway Logs，之後檢查：

- `MARKETDATA_TOKEN`
- `FRED_API_KEY`（缺少時只會退回 4%，不是主要失敗原因）
- MarketData.app 的方案與 NDX/SPX 資料可用性
- Supabase SQL migration 是否完成

### Yahoo 失敗

Yahoo 是非官方備援來源，失敗不必然代表主源失敗。只要 MarketData.app 成功且資料有保存，系統可以產生單源／較低 confidence 的報告；Audit 會如實顯示來源狀態。

### `Supabase ... permission denied` 或 table 不存在

重新執行 `supabase/001_initial_schema.sql`，並確定 Railway 放的是 Secret / service-role key，而非 Publishable key。

## 10. 上線前仍未包含的功能

- 帳號與角色權限
- 真正付款與訂閱
- 即時 OPRA／交易所授權資料
- 盤中 15 分鐘刷新
- Discord / LINE / Telegram 通知
- 完整 NQ/NDX、ES/SPX basis 換算
- 交易策略回測與績效驗證

不要把本版本描述為「即時 dealer flow」或「可直接給出交易建議」。它目前是保存型、延遲／EOD、OI-based GEX research tool。
