# @edv4h/spire-render

## 0.2.0

### Minor Changes

- cc0f337: ノード・エッジ・レイヤの描画を差し替えられるようにした。

  レンダラは **React 要素ではなく図形（`Shape[]`）を返す**。`<SpireMap>` と
  `renderToSVG` が同じ図形を描くので、カスタムの見た目でも**シェア画像が画面と
  一致する**。選び方は他の拡張と同じく **id 参照**で、テーマ（JSON）が
  `{ boss: { renderer: "boss-crown" } }` と名前で指名する。

  - `createRenderPlugin()` — `nodeRenderers` / `edgeRenderers` / `layers` の 3 レジストリ。
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

- a39d4e9: 描画バックエンドを id で差し替えられるようにした。

  `Scene` → `Shape[]` は既にバックエンド非依存なので、バックエンドは最後の一手だけを
  担う。SVG は組み込みで既定、プラグイン不要。canvas や WebGL のバックエンドが要る
  理由は DOM で、数千ノードは数千の DOM 要素を意味する。

  - `RenderBackend` — `{ id, keyboardAccessible, Component }`。`BackendProps` で
    `scene` / `drawing` / `scale` / 操作ハンドラを受け取る
  - `<SpireMap backend="...">` で選ぶ。未登録の id は SVG にフォールバックする
  - `RenderRegistries.backends` に登録する。SVG は登録されない（プラグインなしで
    描けなければならないため）
  - 既存の SVG 描画は `svgBackend` として切り出した。挙動は変えていない

  **`keyboardAccessible` を契約に入れた。** canvas は 1 要素なので、スクリーンリーダーが
  降りる先も Tab で辿れる先も無い。これは細部ではなく本物の代償なので、選ぶ場所で
  見えるようにした。既定が SVG のままなのも同じ理由。

  **破壊的:** `Shape` の `group` が持つ `transform` を、SVG の文字列から
  `{ translate, rotate, scale }` に変えた。文字列は SVG の構文であり、canvas
  バックエンドがそれを parse する羽目になる — 描画語彙が SVG の語彙のままだった。
  2 つめのバックエンドを書いて初めて見えた漏れ。

- b05270d: グリッドに揃えたいものを描けるようにした。

  - `NodeLayout.anchor` / `SceneNode.anchor` — ジッターを掛ける**前**の、グリッドが
    言う位置
  - `SceneNode.cell` — そのノードのグリッド座標（`col` / `row`）

  `center` は**描画される**位置で、テーマのジッターを含む。行ガイド・列の帯・行ラベル
  のように「ノードではなくグリッドに揃えたいもの」を描くには、揺れていない位置が要る。
  描画座標を丸めて行に戻す方法は効かない（同じ行のノードが別の y を持つため）。平均を
  取っても近似にしかならず、ノードが 1 つしかない行では平均にすらならない。

  playground の行ガイドが実際にこれで壊れていた — 12 行のマップに **22 本**（ノード
  1 つに 1 本）の線が引かれていた。

### Patch Changes

- Updated dependencies [b05270d]
  - @edv4h/spire-layout@0.2.0

## 0.1.0

### Minor Changes

- 659e99b: React レンダラと静的 SVG レンダラ。

  - **`buildScene`** — レイアウト・状態・テーマを解決して、色まで決まった図形リストにする。`SpireMap`（React）も `renderToSVG` も**これしか見ない**ので、シェア画像と画面が食い違いようがない
  - **テーマ** — ノードタイプ × 状態でスタイルを解決。`renderNode` で 1 つのタイプだけ自前で描くこともできる
  - **`scale`** — `viewBox` はレイアウトの自然なサイズのまま描画サイズだけを倍率で変える。React と `renderToSVG` で同じ意味
  - **`focusNodeId`** — マップ自身のスクロールコンテナだけを動かす。`scrollIntoView` と違ってホストのページを動かさない。`prefers-reduced-motion` を尊重する

  アニメーションは入れていない。`onNodeStatusChange` が「いつ」状態が動いたかを報せるところまでで、「どう祝うか」はアプリの判断。ここで決め打ちすると、どの Spire マップも同じ製品の顔になる。

  `renderToPNG` は未実装。

### Patch Changes

- Updated dependencies [659e99b]
- Updated dependencies [659e99b]
  - @edv4h/spire-core@0.1.0
  - @edv4h/spire-layout@0.1.0
