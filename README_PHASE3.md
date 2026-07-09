# Kelvin CME Phase 3 Fix — Option Type + Two-Column Parser

這包是針對 7/8 PG40 與 MenthorQ 差距的第三階段 hotfix。

## 替換檔案

請覆蓋到 repo 對應位置：

- `src/cme/parser.ts`
- `src/cme/cmeGex.ts`
- `src/utils/engine.ts`
- `src/db/realDatabase.ts`
- `src/db/supabaseStore.ts`
- `server.ts`

## 修正內容

1. Parser version bump：`cme-pg40-v0.3.0-optiontype-column-resolver`
2. 修 `PUT` 單數被判成 call：`PUTS?` / `CALLS?`
3. 修子區段 `DMQ PUT` / `QMW CALL` 不更新 optionType 的問題
4. 修 `MINI NSDQ EOM C/P` 後綴被丟棄的問題
5. 改成依據 `STRIKE` 表頭偵測左右雙欄，欄內重新 normalize x 座標
6. row parser 改成相對 strike 的欄位 offset，降低右欄掉資料與 OI 誤讀風險
7. debugAudit 增加 rejected row reasons 與 column/rawX 信息
8. IV fallback 從固定 15% 改成同到期日 IV smile 內插，最後才 fallback
9. 牆位選擇不再用 `lastPrice * 1.02/0.98` 捏造 fallback；優先使用 decision window 內實際 strike
10. Negative GEX 的 regime 文案降溫：負 GEX 代表擴張敏感，不直接等於高信念方向
11. Dashboard / import history 優先 v0.3 parser

## 使用步驟

1. 覆蓋檔案
2. commit + push
3. 等 Render / Vercel 重新部署
4. 回網站重新上傳同一份 2026-07-08 PG40
5. 請勾選 Force reparse；或因 parser_version 已升級到 v0.3，同 PDF 也會建立新 import
6. 驗收：
   - parserVersion = `cme-pg40-v0.3.0-optiontype-column-resolver`
   - contractCount 應明顯高於 1,000
   - 29,000 不應再被 put section 誤判成 call
   - expiryGroups 應往 15～20 收斂
   - HVL / Put / Call 應往 MenthorQ 的 29,500 / 29,000 / 30,000 靠近

## 驗收 SQL

```sql
select
  id,
  trade_date,
  parser_version,
  contract_count,
  created_at,
  summary_json -> 'debugAudit' as debug_audit
from public.cme_bulletin_imports
where trade_date = '2026-07-08'
order by created_at desc;
```

```sql
select
  option_type,
  count(*) as rows,
  sum(open_interest) as total_oi
from public.cme_nq_option_contracts
where import_id = '你的新 import id'
group by option_type;
```

```sql
select
  strike,
  option_type,
  sum(open_interest) as oi
from public.cme_nq_option_contracts
where import_id = '你的新 import id'
  and strike in (29000, 29700, 30000)
group by strike, option_type
order by strike, option_type;
```
