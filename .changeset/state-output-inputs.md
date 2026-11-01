---
"@edv4h/spire-core": minor
---

完了の記録に `output`(任意・SDK は解釈しない)を足し、`complete(..., { output })` で残せるようにする。`inputsOf(map, state, nodeId)` で、通ってきた直前のノードの `output` を読める(`single-route` では実際に通った腕だけ)。`mergeStates` のタイブレークに `output` を加え、可換性を保つ。
