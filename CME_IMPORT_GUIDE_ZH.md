# CME PG40 手動匯入與半自動流程

## 為什麼是「手動下載 + 自動解析」
本版不會讓伺服器自動抓取或爬取 CME 網站。你每天自行從 CME Daily Bulletin 取得 `Nasdaq 100 and E-mini Nasdaq 100 Options - PG 40` PDF，再由平台自動解析、驗證、保存。

這樣做有兩個好處：
1. 資料來源是你親自取得的官方 PDF，資料日與檔案可稽核。
2. 避免把網站自動抓取當成理所當然；CME 對網站資料的自動 harvesting/scraping 有明確的使用條款提醒。

## 每日流程（約 30 秒）
1. 打開 CME Daily Bulletin 頁面，下載 `Nasdaq 100 and E-mini Nasdaq 100 Options - PG 40`。
2. 開啟你的 Render 網站首頁，滑到 `CME official EOD import`。
3. 選擇 PDF，輸入 `REFRESH_API_TOKEN`，按 `上傳並匯入`。
4. 平台會把解析出的 OI、settlement、volume、CME delta、expiry group 寫入 Supabase。
5. 在 Supabase 看到 `cme_bulletin_imports` 與 `cme_nq_option_contracts` 新資料列。

## 初版資料與限制
- NQ futures settlement、OI、settlement、volume、CME-published delta：可解析並保存。
- Weekly/daily option expiry：本版以可見 product family 推估，資料列會標示 `estimated`。
- 由 settlement 反推 IV、Black-76 GEX、0DTE 精確 TTE：屬於下一個校正步驟。尚未通過 MentorQ benchmark 驗證前，不能把結果稱為 dealer truth 或最終 GEX。

## 半自動提醒機器人（安全路線）
可以再加一個 GitHub Actions / Telegram / Discord 提醒：每個交易日下午或隔日早上提醒你「下載 PG40 並上傳」。

機器人可自動做：
- 提醒你
- 檢查是否已經成功匯入當日 PDF
- 匯入後推播摘要

但不直接自動下載 CME 網站 PDF，除非你已取得 CME 對該自動存取方式的授權。
