---
"@edv4h/spire-plugin-rules-extra": minor
"@edv4h/spire-plugin-policy-quorum": minor
---

公開 API だけでレジストリを拡張する実例。

- **rules-extra** — 生成の制約ルールを3つ追加する（`maxTotal` / `rowRange` / `afterTypes`）。gen に依存を宣言しているので、gen を外すと `missing_dependency` で明示的に落ちる
- **policy-quorum** — 「先行ノードが N 個完了したら開く」進行ポリシー。組み込みの `strict` は1つで開くが、これは `threshold` 個を要求する

どちらも `createSpire` に渡すだけで効き、GenSpec や `complete` からは文字列 id で参照される。
