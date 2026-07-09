# Kelvin CME Phase 5 Replacement Files

目的：修正 v0.3.0 column resolver 造成的 OI 膨脹 / 牆位倒置問題。

## 替換檔案

請覆蓋到 repo 對應位置：

- server.ts
- src/cme/parser.ts
- src/db/supabaseStore.ts
- src/utils/engine.ts

## 這版做什麼

1. Parser 升級為 `cme-pg40-v0.3.1-safe-optiontype-geometry`。
2. 保留 PUT / CALL context 修正，但取消 v0.3.0 aggressive column geometry，避免 OI 被右欄 / 相對 x offset 誤讀放大。
3. Supabase latest import ranking 改為：v0.3.1 > v0.2 > v0.3.0 > v0.1。
   - 因為 v0.3.0 已知會造成 7/8 OI 膨脹與 put/call wall 倒置。
4. Headline Call Wall / Put Wall 改用 option-type-specific exposure：
   - Call Wall 必須優先從 spot 上方的 call_gex 選。
   - Put Wall 必須優先從 spot 下方的 put_gex 選。
   - 避免 `Put Wall = 30500` 這種高於現價的支撐牆錯位。

## 部署後操作

1. 部署替換檔案。
2. 重新上傳 2026-07-08 PG40，勾選 Force reparse。
3. 確認新 import 顯示：
   - parser = `cme-pg40-v0.3.1-safe-optiontype-geometry`
   - rows 應回到合理區間，預期約 4,000 左右，而不是 OI 破百萬的 v0.3.0 狀態。
4. 如果還沒有重新匯入 v0.3.1，dashboard 會先偏好 v0.2，而不是已知有問題的 v0.3.0。

## 驗收 SQL

```sql
select
  trade_date,
  parser_version,
  contract_count,
  created_at,
  summary_json ->> 'callOpenInterest' as call_oi,
  summary_json ->> 'putOpenInterest' as put_oi
from public.cme_bulletin_imports
where trade_date = '2026-07-08'
order by created_at desc;
```

```sql
select
  option_type,
  count(*) as rows,
  sum(open_interest) as total_oi,
  max(open_interest) as max_oi
from public.cme_nq_option_contracts
where import_id = '你的 v0.3.1 import id'
group by option_type;
```

合理目標：Call / Put 總 OI 不應再出現 v0.3.0 的 1,450,160 / 1,256,165 這種膨脹值。
