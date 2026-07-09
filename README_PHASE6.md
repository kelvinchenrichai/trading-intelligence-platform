# Kelvin CME Phase 6 Replacement Files

目的：加入「今日盤前預判 / 多空偏向」卡片，並修正信心一致性、0DTE/Front expiry 牆位距離權重與 Multi Expiration audit 標記。

## 替換檔案

請覆蓋到 repo 對應位置：

- `src/types.ts`
- `src/cme/report.ts`
- `src/utils/engine.ts`
- `src/components/PlaybookPanel.tsx`
- `src/components/MultiExpirationMap.tsx`

## 這版做什麼

1. 新增 `playbook.premarketBias`：
   - 顯示「今日盤前預判」
   - 顯示 Bull / Bear / Range 條件機率
   - 顯示偏多觸發、偏空觸發與失效條件
   - 明確標示這是條件推演，不是喊單

2. 修正信心一致性：
   - 如果價格貼近 Gamma Flip，Playbook confidence 會被 cap 在中或低。
   - 不會再出現上方 regime 低信念、下方作戰地圖高信心的矛盾。

3. 0DTE / Front expiry wall selection 優化：
   - `AnalyzeMarketStructureOptions` 新增 `wallDistanceWeight`。
   - 0DTE / 1DTE / 2DTE 會使用較強距離權重，避免遠端 OI blob 直接當盤中牆位。
   - All-exp 主圖維持較穩定的 exposure ranking。

4. Multi Expiration audit 標記：
   - Flip / Pivot / Wall 若距離 spot 超過合理交易窗，UI 會標示 `Audit` 或 `Audit only / 遠端參考`。
   - 遠端數值仍保留，但不應作為主交易決策。

## 部署後操作

1. 覆蓋檔案後 commit / push。
2. 重新部署。
3. 不需要重新匯入 PG40；這版主要是 report / dashboard 邏輯，會用現有 v0.3.1 import 重算輸出。
4. Hard refresh 網站。

## 驗收重點

- 作戰地圖上方應出現「今日盤前預判」。
- 如果價格貼近 Gamma Flip，信心不應再顯示高。
- 盤前預判應該類似：中性偏空 / 等待破位、無優勢 / Flip 區等待、條件性偏多、條件性偏空、盤整區間。
- Multi Expiration 表格中遠端 `10000`、`31826`、`27111` 這類值會被標示 Audit。
