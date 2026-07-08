# 創作者檢查 / 測試 / 介紹網站指南

這個網站的定位不是喊單，也不是自動交易。它是一套「盤前地圖 + 盤中確認」系統：CME PG40 提供官方 EOD OI 結構，TradingView 負責盤中即時價格確認與 webhook 事件回傳。

## 1. 第一次部署後一定要確認的設定

### Render / 後端環境變數

至少要有：

```txt
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service role key
TV_WEBHOOK_SECRET=你自訂的 TradingView webhook 密碼
```

可選：

```txt
MARKETDATA_TOKEN=你的 MarketData.app token
FRED_API_KEY=你的 FRED API key
```

如果畫面出現「尚未連接 Supabase；任何快照在伺服器重啟後都會消失」，代表 Render 後端沒有正確讀到 `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY`。

## 2. Supabase SQL 執行順序

到 Supabase → SQL Editor，依序執行：

```txt
supabase/001_initial_schema.sql
supabase/002_cme_bulletin_import.sql
supabase/003_tradingview_events.sql
```

如果看到：

```txt
Could not find the table 'public.tradingview_events' in the schema cache
```

通常代表 `003_tradingview_events.sql` 還沒執行、執行在錯的 Supabase 專案、或剛建立後 schema cache 還沒刷新。先確認 Table Editor 裡是否看得到 `tradingview_events`，再重新部署或重整後端。

## 3. 每天使用流程

### Step 1：上傳 CME PG40

進入 CME Import 頁籤，上傳當天或前一交易日的 CME Daily Bulletin PG40 PDF。

上傳後確認：

- trade date 是否正確
- underlying 是否為 NQ 期貨合約，例如 NQU2026
- parsed contracts count 是否大於 0
- expiry groups 是否合理

### Step 2：刷新 EOD Snapshot

回 Dashboard，按「更新 EOD 快照」。

刷新後先看 Data Source Status：

- 如果顯示「CME 官方 EOD 盤前地圖」：代表 Dashboard 日期與 CME tradeDate 完全匹配。
- 如果顯示「NDX Proxy 備援模式」：代表這天沒有完全匹配的 CME PG40，系統沒有偷用舊日期 CME。

### Step 3：看盤前地圖

主要看：

- Call Wall：上方壓力區
- Put Wall：下方支撐區
- Gamma Flip / Zero Gamma：Dealer hedge 行為可能轉換的區域
- Gamma Pivot / Hedge Balance：累積 GEX 平衡參考
- Max Pain：到期結構參考
- Expected Move High / Low：期權隱含波動範圍

### Step 4：看 Multi Expiration

這裡是盤前地圖的核心之一：

- First Expiration：最近到期
- Next Expiration：下一個到期
- Highest GEX Expiry：GEX 結構影響最大的到期
- 2nd Highest GEX Expiry：第二大影響到期

用途：判斷今天主要牆位是不是集中在近月 / 0DTE，還是由更後面的 expiry 主導。

### Step 5：看 Full Chain View

GEX Chart 有三種模式：

- Trade View：交易視圖，預設 Spot ±1000 點
- Top GEX View：看絕對 GEX 最大的前 50 個 strikes
- Full Chain View：完整鏈，固定高度，內部滾動

Full Chain 的跳轉按鈕可直接跳到 Spot、Flip、Call Wall、Put Wall、Top GEX。

### Step 6：複製 TradingView Payload

進入 TradingView Export 頁籤，選一種格式複製：

- Simple CSV：適合簡單 Pine input
- Key=Value：適合可讀性較高的 Pine input
- Compact Engine Payload：適合未來更完整的 Pine parser

### Step 7：設定 TradingView Alert Webhook

TradingView alert message 範例：

```json
{
  "secret": "你的 TV_WEBHOOK_SECRET",
  "source": "tradingview",
  "symbol": "{{ticker}}",
  "interval": "{{interval}}",
  "event": "CALL_WALL_BREAKOUT_2X5M",
  "side": "up",
  "levelType": "CALL_WALL",
  "level": 30300,
  "price": "{{close}}",
  "time": "{{timenow}}",
  "modelDate": "2026-07-06",
  "underlying": "NQU2026",
  "dataMode": "CME_PG40"
}
```

Webhook URL：

```txt
https://你的後端網址/api/tradingview/webhook
```

## 4. 如何跟別人介紹這個網站

可以這樣講：

> 這不是喊單工具，也不是自動交易系統。它是把 CME 官方 PG40 盤後 OI 結構轉成隔天盤前地圖，先找出 NQ / ES 當天真正重要的牆位、Flip、Pivot、Max Pain 與 Expected Move。盤中則透過 TradingView 的 5m close、VWAP、BOS 與 webhook 事件，確認價格是否真的突破、跌破、翻轉，最後把狀態歸類成盤整、擴張或無優勢。

## 5. 每次更新後的檢查清單

- [ ] Render build 成功
- [ ] `/api/health` 正常
- [ ] Supabase 顯示 connected / durable
- [ ] CME Import 可以列出歷史匯入
- [ ] Dashboard 日期與 CME tradeDate 一致
- [ ] Data Source Status 沒有把 Proxy 說成 CME
- [ ] Audit Panel 在 CME 模式下顯示「CME 官方資料匯入狀態」
- [ ] TradingView Export 可以複製 payload
- [ ] `/api/tradingview/session?modelDate=YYYY-MM-DD&underlying=NQU2026` 不應該再因為缺表直接炸 503
- [ ] TradingView webhook 測試能寫入 `tradingview_events`

## 6. 常見錯誤

### 尚未連接 Supabase

原因：Render 環境變數缺少 `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY`。

### 找不到 tradingview_events

原因：沒有執行 `supabase/003_tradingview_events.sql`，或執行在錯的 Supabase 專案。

### Session Flow unavailable

這不是錯誤。意思是目前還沒收到 TradingView webhook 事件，所以盤中確認層尚未啟動；系統仍在使用 CME EOD OI 盤前基準。

### CME warning 很多

這些是風險提示，提醒你 PG40 是 EOD baseline，不是 live options flow；週到期 / 日到期的精確解析還需要之後補強。
