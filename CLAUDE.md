# Spire SDK

## プロジェクト概要

ドメイン非依存の**レーン型 DAG マップ**エンジン。「目標」「クエスト」「踏破」といった意味論を持たず、グリッド上のノード / エッジ / 進行状態という位相的な概念だけを知っている。ノードタイプは利用者定義の不透明な文字列。

**Spire Map Format (SMF)** という宣言的 JSON が公開契約であり、実装は差し替え可能。構造（MapDocument）と進行状態（StateDocument）は別ドキュメント。

## 現在のステータス

v0.1 実装中。`core` / `gen` / `layout` は実装済み。`render` は型とデフォルトテーマのみ（React コンポーネントと SVG/PNG レンダラは次フェーズ）。

## 重要ドキュメント

- `docs/smf-0.1.md` — SMF 仕様。**公開契約なので、ここを変えるときは互換性ポリシー（§5）に従う**
- `docs/plugin-system.md` — プラグイン作者向けガイド。**実装済みのものだけを書く。未実装を「ある」と読める形で書かない**
- `docs/deviations-from-design.md` — 設計書からの差分と理由。設計と実装がずれたらここを更新する
- `docs/design-v0.1.md` — 元の設計書（2026-08-05）。歴史的資料であり、現在の仕様ではない

## 設計の出典

プラグインシステムとモノレポ規約は `~/Projects/usketch`（同一著者の別プロジェクト）を下敷きにしている。3フィールドのプラグイン契約、ファクトリ関数、`defineService`、bundler なしの tsc ビルドはそこから。usketch 側の既知の失敗（依存解決なし・重複 id の silent 上書き・setup throw でアプリごと死ぬ・ログでのエラー処理）は意図的に直してある。差分表は `docs/plugin-system.md` §8。

## 規約

### ファイル命名

すべての `.ts` は **kebab-case**。CI（`check-filenames.yml`）で強制。

### ビルド

**bundler は使わない。** 各パッケージ `tsc -p tsconfig.build.json` のみ、ESM 専用、`exports` は `"."` だけ。tsdown を入れるのは「CJS デュアル配布が要る」「render に CDN 用の単一ファイルが要る」のいずれかが立ったときで、そのときも該当パッケージだけ。

- `tsconfig.json` = 型検査用（テストを含む）
- `tsconfig.build.json` = ビルド用（テストと `__fixtures__` を除外）

### barrel ファイル

`src/index.ts` は明示的な named re-export。**`export *` は使わない。** 相対 import には `.js` 拡張子を付ける（`verbatimModuleSyntax`）。

### エラー処理

**投げない、ログを出さない。** 想定される失敗はすべて `Result<T, E>` で返す。ヘッドレス SDK が stdout を汚してはいけない。プログラマのバグ（Spire 自身の不具合）だけが例外を投げてよい。

### zod

すべてのドキュメントスキーマは `z.looseObject`。**`z.object` を使ってはいけない** — 未知フィールドを落とすと forward-compatibility が壊れ、新しいマイナーバージョンで書かれたドキュメントがホストのデータを失う。

### 決定性

生成とジッターは `createRng(seed)` のみを使う。**`Math.random` は禁止。** 同じ入力からは常に同じ出力が出る。

### 拡張

新しいルール・ポリシー・アルゴリズムを core / gen に直接足す前に、プラグインで足せないか考える。組み込みは「マップが構造的に成立するために要るもの」だけに保つ。

## 技術スタック

TypeScript 7 / zod 4 / pnpm workspaces / Turborepo / Biome / Vitest / fast-check / Changesets / prek

## パッケージ構成

```
packages/
  core/     @edv4h/spire-core     — SMF・検証・進行・グラフ・プラグインカーネル
  gen/      @edv4h/spire-gen      — 生成パイプライン
  layout/   @edv4h/spire-layout   — グリッド→画面座標
  render/   @edv4h/spire-render   — レンダラ契約（v0.1 は型のみ）

plugins/
  rules-extra/    @edv4h/spire-plugin-rules-extra
  policy-quorum/  @edv4h/spire-plugin-policy-quorum

examples/
  cli/                @edv4h/spire-example-cli  — ASCII で生成マップを目視確認
  acme-plugin-demo/   @acme/spire-onboarding    — 第三者スコープからの拡張の証明
```

依存方向は `gen → core ← layout ← render`。**gen と render は互いを知らない。** `examples/acme-plugin-demo` が壊れたら公開 API が壊れたということ。

## 検証

```bash
pnpm install
pnpm turbo run typecheck build test
pnpm lint
pnpm --filter @edv4h/spire-example-cli start -- --walks 4 --count 5
```
