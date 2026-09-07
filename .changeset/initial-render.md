---
"@edv4h/spire-render": minor
---

React レンダラと静的 SVG レンダラ。

- **`buildScene`** — レイアウト・状態・テーマを解決して、色まで決まった図形リストにする。`SpireMap`（React）も `renderToSVG` も**これしか見ない**ので、シェア画像と画面が食い違いようがない
- **テーマ** — ノードタイプ × 状態でスタイルを解決。`renderNode` で1つのタイプだけ自前で描くこともできる
- **`scale`** — `viewBox` はレイアウトの自然なサイズのまま描画サイズだけを倍率で変える。React と `renderToSVG` で同じ意味
- **`focusNodeId`** — マップ自身のスクロールコンテナだけを動かす。`scrollIntoView` と違ってホストのページを動かさない。`prefers-reduced-motion` を尊重する

アニメーションは入れていない。`onNodeStatusChange` が「いつ」状態が動いたかを報せるところまでで、「どう祝うか」はアプリの判断。ここで決め打ちすると、どの Spire マップも同じ製品の顔になる。

`renderToPNG` は未実装。
