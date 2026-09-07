# @edv4h/spire-plugin-rules-extra

## 0.1.0

### Minor Changes

- 659e99b: 公開 API だけでレジストリを拡張する実例。

  - **rules-extra** — 生成の制約ルールを 3 つ追加する（`maxTotal` / `rowRange` / `afterTypes`）。gen に依存を宣言しているので、gen を外すと `missing_dependency` で明示的に落ちる
  - **policy-quorum** — 「先行ノードが N 個完了したら開く」進行ポリシー。組み込みの `strict` は 1 つで開くが、これは `threshold` 個を要求する

  どちらも `createSpire` に渡すだけで効き、GenSpec や `complete` からは文字列 id で参照される。

### Patch Changes

- Updated dependencies [659e99b]
- Updated dependencies [659e99b]
  - @edv4h/spire-core@0.1.0
  - @edv4h/spire-gen@0.1.0
