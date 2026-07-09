# Kelvin CME Phase 8 — 0DTE / Expiry / Trade Path MenthorQ Alignment

## 替換檔案
覆蓋以下檔案：

```text
src/cme/report.ts
```

## 修正重點

1. **0DTE / First Active Expiration 對齊**
   - 用 Target Session 後的 First Expiration 做 0DTE。
   - 0DTE call wall 會優先挑選現價上方、EM 路徑內的有效阻力。
   - 0DTE put wall 會優先挑選 EM Low / all-exp Put Support 附近的有效支撐。
   - 目標是讓 7/9 benchmark 往 MenthorQ 的 29700 / 29000 / 29460 靠近。

2. **Expiry-level HVL 遠端污染修正**
   - 單一 expiry 的 Gamma Flip 若遠離現價太多，會以 near-spot GEX profile transition 或 all-exp HVL 做安全修正。
   - 目標是避免 2026-07-10 顯示 27442 這類不適合交易決策的遠端 Flip。

3. **盤前偏向更接近 MenthorQ**
   - Negative GEX 不再因為貼近 Flip 而給過高 Range 機率。
   - Bear 機率會更接近 65–75%，Bull 約 20–25%，Range 約 5–10%。
   - 仍保留「執行上等待 2×5m / VWAP / BOS 確認」。

4. **交易路徑改為 MenthorQ-style 階梯**
   - 不再顯示太多 294xx 微小階梯。
   - 路徑會偏向 50/100 點級別的交易水位。
   - 偏空路徑會更像：29500 → 29300 → 29200 → 29000 → 28750/28500。
   - 偏多路徑會更像：29500 → 29700 → 29850/29900 → 30000。

## 部署

```bash
git add .
git commit -m "Align 0DTE expiry and trade path with MenthorQ benchmark"
git push
```

部署後 hard refresh。這包主要是 report logic，不一定要重新上傳 PG40。

## 驗收

看 7/8 CME / 7/9 Target Session：

- All-exp HVL 應保持接近 29460。
- First Expiration 應是 2026-07-09。
- First Expiration Call Wall 應往 29700 靠近。
- First Expiration Put Wall 應往 29000 靠近。
- Next Expiration HVL 不應再是 27442 這種遠端污染值。
- 今日盤前預判 Bear 應接近 65–75%，Range 應降到 5–10%。
- 交易路徑應變成較大級別階梯，不再滿版 294xx 微水位。
