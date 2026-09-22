---
"@edv4h/spire-render": minor
---

`@edv4h/spire-render/headless` を追加した。メインの入口は `SpireMap` を re-export するので、`renderToSVG` しか呼ばないサーバでも React が必要だった。`headless` は React を import する3ファイル（`SpireMap` / `Shapes` / SVG バックエンド）を除いた同じ中身で、レンダラの登録も静的 SVG 出力もここから完結する。あわせて `react` を optional peer にした。

README も 0.2.0 の拡張点に追いついた — カスタムノード/エッジ/レイヤレンダラ、図形ボキャブラリ（なぜ JSX ではなく図形を返すのか）、`scale`、差し替え可能なバックエンドと `keyboardAccessible` の代償。npm に出ていた説明文が "(v0.1: types only)" のままだったのも直した。
