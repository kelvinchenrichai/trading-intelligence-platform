# Render / MarketData 修正 V1.0.1

這個更新修正 `Invalid time value`，不是環境變數或 Supabase 問題。

## 修正內容

1. MarketData.app 日期解析現在可接受 Unix 秒、Unix 毫秒、ISO 日期時間與 `YYYY-MM-DD` 字串。
2. 不再使用未列在官方 Option Chain 文件中的 `dateformat` 查詢參數。
3. 改用官方的 `/v1/options/expirations/{symbol}/` 先取得到期日，再針對前 `MAX_EXPIRIES` 個到期日抓各自的 chain。此前舊程式未指定 `expiration` 時，實際只會取得預設的一個到期日。
4. 單一到期日或單一合約資料異常時，會略過壞資料，保留其他可用的到期日與合約。
5. 當 MarketData / Yahoo 都失敗時，`/api/health` 會保留每個 provider 的實際錯誤狀態，便於排錯。

## GitHub 網頁更新（不用裝本機）

在 GitHub repository 中依序開啟以下目錄，按 **Add file → Upload files**，上傳本更新包中對應檔案，讓 GitHub 覆蓋舊檔：

- `src/providers/`：上傳 `marketDataApp.ts`、`dataOrchestrator.ts`、`yahooFinance.ts`、`dateUtils.ts`
- `src/db/`：上傳 `realDatabase.ts`

確認 GitHub 顯示 5 個檔案變更後，按 **Commit changes**。Render 偵測到 main branch 更新後會自動重新部署。

## Render 測試順序

1. 先確認 `AUTO_REFRESH_ON_START=true`。
2. 等部署完成，打開 Render Logs。
3. 成功時應看到：`[startup] refresh completed: YYYY-MM-DD`。
4. 再開 `https://你的網址/api/health`：應有 `latestSnapshotDate`，且 `lastRefresh.success` 為 `true`。
5. 確認成功後，將 `AUTO_REFRESH_ON_START` 改回 `false`，儲存並重新部署，避免免費服務喚醒時重複消耗資料額度。

## 若仍失敗

只貼 Render Logs 裡的 MarketData / Yahoo 相關行與 `/api/health` JSON；不要貼 API Key。現在 health 會顯示是哪個 endpoint、HTTP 狀態或到期日失敗。
