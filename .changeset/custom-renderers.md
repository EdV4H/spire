---
"@edv4h/spire-render": minor
---

ノード・エッジ・レイヤの描画を差し替えられるようにした。

レンダラは **React 要素ではなく図形（`Shape[]`）を返す**。`<SpireMap>` と
`renderToSVG` が同じ図形を描くので、カスタムの見た目でも**シェア画像が画面と
一致する**。選び方は他の拡張と同じく **id 参照**で、テーマ（JSON）が
`{ boss: { renderer: "boss-crown" } }` と名前で指名する。

- `createRenderPlugin()` — `nodeRenderers` / `edgeRenderers` / `layers` の3レジストリ。
  `getRenderRegistries(spire)` で引ける
- `Shape` — circle / rect / path / line / polygon / text / group。両バックエンドが
  同じ union を歩くので、片方だけに新しい図形が増えることが型で防がれる
- `SpireMap` と `renderToSVG` に `spire` を渡すと id が解決される。渡さなければ
  組み込みの見た目。**未登録の id も組み込みにフォールバックする** — テーマが
  マップを白紙にできてはいけない
- `SpireTheme.layers` で描くレイヤを絞れる。省略すると登録済みのすべてを描く
- `SceneNode` に `data`、`SceneEdge` に `start` / `end` / `control` を足した。
  ラベルを描くのに map を参照しに行ったり、矢じりの角度を `d` 文字列から
  逆算したりせずに済むため

既存の `renderNode` prop はそのまま。ただし **React でしか動かない**（`renderToSVG`
は実行できない）ので、これを使うと画面とシェア画像がずれる。型と docs にその旨を
書いた。`foreignObject` など本当に React が要るときの逃げ道として残してある。

**出力の変更:** `renderToSVG` はノードを `<g transform="translate(…)">` で包むように
なった（`data-spire-node` / `data-spire-status` はその `<g>` に付く）。React 側は
元からこの形だったので、両バックエンドの DOM 構造が揃った。
