---
"@edv4h/spire-render": minor
---

`SpireMap` は `scale` を受け取れるようになった。`viewBox`
はレイアウトの自然なサイズのまま、描画サイズだけを倍率で変える
（`renderToSVG` の `scale` と同じ意味）。シーンには手を触れないので、
拡大してもジオメトリと `renderToSVG` の出力は一致したままになる。
