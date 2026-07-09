# Kelvin CME Phase 9 — Intraday Scenario Switcher / 盤中劇本切換器

## 替換檔案
覆蓋以下檔案：

```text
server.ts
src/types.ts
src/cme/report.ts
src/db/supabaseStore.ts
src/components/SessionMonitor.tsx
```

## 修正重點

1. **新增盤中劇本切換器**
   - 把盤前 Bias 和盤中執行狀態分開顯示。
   - 使用者不會再把 Bear 69% 誤解成「直接追空」。
   - UI 會顯示：盤前 Bias、目前劇本、執行提示、路徑、失效條件。

2. **支援盤中多空切換**
   - Expansion Up：多頭劇本已觸發，盤前偏空失效，Negative GEX 會放大上漲。
   - Expansion Down：空頭劇本已觸發，盤前偏空轉成可執行劇本。
   - Consolidation / Pin：盤中 flow 偏磁吸，避免追單。
   - Neutral / Wait：Flip 區等待 2×5m + VWAP / BOS 確認。

3. **TradingView webhook 狀態更完整**
   - 新增顯示 BOS_UP / BOS_DOWN。
   - 新增顯示 AVWAP_RECLAIM / AVWAP_REJECT。
   - 新增顯示 GAMMA_FLIP_REJECT。
   - Supabase reducer 會把 `GAMMA_FLIP_RECLAIM + AVWAP_RECLAIM` 判為 Expansion Up。
   - Supabase reducer 會把 `GAMMA_FLIP_REJECT + AVWAP_REJECT` 判為 Expansion Down。

4. **保留 Phase 8 HVL / 交易路徑成果**
   - All-exp HVL/Gamma Flip 目前 29468.7，MenthorQ benchmark 約 29460，誤差約 8.7 點。
   - 不再對單日 benchmark 硬寫死 29460，避免 overfit。
   - 若要進一步縮小誤差，下一步應用多日 MenthorQ benchmark 做參數回歸，而不是單日硬調。

## 部署

```bash
git add .
git commit -m "Add intraday scenario switcher"
git push
```

部署後 hard refresh。

## 驗收

畫面中的 Session Monitor 應改為：

```text
Scenario Switcher / 盤中劇本切換器
```

並顯示：

```text
盤前 Bias
目前劇本
執行提示
多頭 / 空頭路徑
失效條件
```

如果還沒收到 TradingView webhook，應顯示：

```text
Flip 區等待確認
盤前 Bias 是結構機率；目前尚未有足夠盤中事件確認方向。
```

若 TradingView webhook 送入 `BOS_UP` 或 `CALL_WALL_BREAKOUT_2X5M`，應切換：

```text
多頭劇本已觸發
```

若送入 `BOS_DOWN` 或 `PUT_WALL_BREAKDOWN_2X5M`，應切換：

```text
空頭劇本已觸發
```
