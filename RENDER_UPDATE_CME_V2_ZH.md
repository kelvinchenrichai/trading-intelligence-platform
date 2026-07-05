# Render 更新指南：V2 CME Daily Bulletin PG40 匯入版

本更新保留既有的 NDX / SPX proxy 研究頁，並新增「CME 官方 EOD 匯入」區塊。它不會自行下載 CME 網站資料；你每天自行下載 PG40 PDF 後，上傳一次，系統會自動解析並寫入 Supabase。

## 先做 Supabase Migration

1. 開啟 Supabase 專案。
2. 進入 **SQL Editor**。
3. 開啟此專案中的：

```text
supabase/002_cme_bulletin_import.sql
```

4. 複製全部 SQL、貼入、按 **Run**。
5. 看到 `Success. No rows returned` 即完成。

會新增：

```text
cme_bulletin_imports
cme_nq_option_contracts
```

## 更新 GitHub Repository

1. 下載並解壓 V2 ZIP。
2. 進入你現有 GitHub repository。
3. 將解壓後資料夾內的檔案與資料夾上傳到 repository 根目錄並覆蓋同名檔案。
4. 特別確認這些內容存在：

```text
src/cme/
src/components/CmeBulletinImport.tsx
supabase/002_cme_bulletin_import.sql
CME_IMPORT_GUIDE_ZH.md
Dockerfile
server.ts
package.json
```

5. Commit changes。
6. Render 偵測到 main branch 變更後會自動 rebuild / deploy。

> 不要上傳 `.env`、API key、Supabase secret key。

## Render Variables

保留既有的：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
REFRESH_API_TOKEN
MARKETDATA_TOKEN
FRED_API_KEY
```

新增或確認：

```text
CME_PG40_IMPORT_ENABLED=true
AUTO_REFRESH_ON_START=false
```

`REFRESH_API_TOKEN` 是 CME 上傳的私用授權碼。它只會在你上傳時由瀏覽器送到同網域 API；平台不會把它寫入資料庫、GitHub 或前端 bundle。請不要貼到聊天、截圖或公開網頁。

## 每日使用流程

1. 到 CME Daily Bulletin 頁面下載：

```text
Nasdaq 100 and E-mini Nasdaq 100 Options — PG 40
```

2. 打開你的 Render 首頁。
3. 滑到最下方的 **CME official EOD import**。
4. 選擇剛下載的 PDF。
5. 輸入你的既有 `REFRESH_API_TOKEN`。
6. 按 **上傳並匯入**。
7. 成功時頁面會顯示資料日與已保存的 NQ options rows 數量。

## 成功後驗證

到 Supabase → Table Editor：

```text
cme_bulletin_imports
cme_nq_option_contracts
```

預期：

- `cme_bulletin_imports`：一份 PDF 一列。
- `cme_nq_option_contracts`：數千列 NQ futures-option contracts。
- 同一份 PDF 重複上傳會因 SHA-256 去重被拒絕，避免重複資料。

## 現階段限制（請保留）

這是 CME NQ futures-options 的官方 EOD 資料匯入基礎，不是最終 MentorQ 複刻。

- `expiry_precision=estimated`：weekly / daily 期限仍需用 CME contract calendar 校正。
- 已保存：CME OI、settlement、volume、CME-published delta、合約群組與原始解析列。
- 尚未對外輸出：經歷史校正的 Black-76 GEX、0DTE 精確剩餘分鐘、Dealer 真實持倉、最終 HVL。
- 不要把資料稱為即時、Dealer truth 或投資建議。

## 自動化提醒機器人

本版不會自動下載 CME PDF。後續可再加 GitHub Actions / Telegram / Discord 提醒機器人：

```text
每天提醒 → 你自行下載 PG40 → 網站上傳 → 系統自動解析與保存 → 回傳摘要
```

若要做「直接每天自動下載 CME 網站 PDF」，需要先確認 CME 的授權／資料使用條款允許該自動存取方式。
