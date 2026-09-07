---
"@edv4h/spire-render": minor
---

描画バックエンドを id で差し替えられるようにした。

`Scene` → `Shape[]` は既にバックエンド非依存なので、バックエンドは最後の一手だけを
担う。SVG は組み込みで既定、プラグイン不要。canvas や WebGL のバックエンドが要る
理由は DOM で、数千ノードは数千の DOM 要素を意味する。

- `RenderBackend` — `{ id, keyboardAccessible, Component }`。`BackendProps` で
  `scene` / `drawing` / `scale` / 操作ハンドラを受け取る
- `<SpireMap backend="...">` で選ぶ。未登録の id は SVG にフォールバックする
- `RenderRegistries.backends` に登録する。SVG は登録されない（プラグインなしで
  描けなければならないため）
- 既存の SVG 描画は `svgBackend` として切り出した。挙動は変えていない

**`keyboardAccessible` を契約に入れた。** canvas は1要素なので、スクリーンリーダーが
降りる先も Tab で辿れる先も無い。これは細部ではなく本物の代償なので、選ぶ場所で
見えるようにした。既定が SVG のままなのも同じ理由。

**破壊的:** `Shape` の `group` が持つ `transform` を、SVG の文字列から
`{ translate, rotate, scale }` に変えた。文字列は SVG の構文であり、canvas
バックエンドがそれを parse する羽目になる — 描画語彙が SVG の語彙のままだった。
2つめのバックエンドを書いて初めて見えた漏れ。
