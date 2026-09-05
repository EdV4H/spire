---
"@edv4h/spire-core": minor
---

**破壊的:** `complete` の既定ポリシーを `"strict"` から新しい `"single-route"` に変えた。

完了集合が1本の途切れない道であり続ける限りだけ完了できる。分岐の片方を通ると、
もう片方は閉じる。`strict` は分岐のすべての腕を踏破できてしまい、それでは分岐が
選択にならないため。始端も1つに限られる（道を始めたあとの2つめの始端は拒否）。

従来の挙動が要るなら `{ policy: "strict" }` を明示する。ノードが「行き先」ではなく
「集めるもの」であるマップでは `strict` が正しい。

併せて `getCompletableNodes(map, state, { policy })` を追加した。`getReachableNodes`
は構造的な問い（完了した先行ノードがあるか）に答えるものでポリシーを知らないので、
`single-route` の下では両者が食い違う — 通らなかった側の分岐は reachable のままで
completable ではない。UI が「いま進める先」を出したいときはこちらを使う。

`BUILTIN_POLICIES` の実体は `progress/policies.ts` へ移した（barrel からの export 名は
そのまま）。
