# Spire SDK

ドメイン非依存の**レーン型 DAG マップ**エンジン。

Spire は「目標」「クエスト」「踏破」といった意味論を持たない。知っているのはグリッド上のノードとエッジ、そして未到達 / 到達可能 / 完了という位相的な概念だけ。ノードタイプは**利用者が定義する不透明な文字列**で、SDK はその中身を解釈しない。

そのおかげで同じエンジンが、目標達成マップにも、学習カリキュラムにも、オンボーディングフローにも、ゲームのステージマップにも使える。

```
 11     F       F   F
         \   /     |
 10         S       S
           |     /
  9         G   G
         /       \
  8     S           S
      / | \         |
  7 S   S   B       S
```

## パッケージ

| パッケージ | 役割 |
|---|---|
| [`@edv4h/spire-core`](packages/core) | Spire Map Format、バリデータ、進行ステートマシン、グラフ操作、プラグインカーネル |
| [`@edv4h/spire-gen`](packages/gen) | 決定的なマップ生成（骨格 → タイプ割当 → コンテンツ注入） |
| [`@edv4h/spire-layout`](packages/layout) | グリッド座標 → 画面座標、ジッター、ベジェ経路 |
| [`@edv4h/spire-render`](packages/render) | React レンダラ、静的 SVG レンダラ、テーマ |
| [`@edv4h/spire-plugin-rules-extra`](plugins/rules-extra) | 追加の制約ルール |
| [`@edv4h/spire-plugin-policy-quorum`](plugins/policy-quorum) | 「N 本の経路が合流したら開く」進行ポリシー |

依存方向は `gen → core ← layout ← render`。**gen と render は互いを知らない。**

## インストール

```bash
pnpm add @edv4h/spire-core @edv4h/spire-gen          # 生成まで
pnpm add @edv4h/spire-layout @edv4h/spire-render     # 描画するなら
```

ESM 専用、`exports` は `"."` だけ。`@edv4h/spire-core` の実行時依存は `zod` のみで、
DOM にも React にも依存しない。`@edv4h/spire-render` は `react >= 19` を peer に持つ。

## クイックスタート

```ts
import { complete, emptyState, getNodeStatus, validateMap } from "@edv4h/spire-core";
import { generate } from "@edv4h/spire-gen";

const result = await generate({
	seed: 42,
	skeleton: { grid: { cols: 5, rows: 12 }, walks: 4, minStarts: 2 },
	types: {
		distribution: { step: 0.7, gate: 0.2, bonus: 0.1 },
		constraints: [
			{ rule: "fixedRow", row: -1, type: "final" },
			{ rule: "minRow", type: "gate", row: 3 },
			{ rule: "branchDistinct", exempt: ["final"] },
		],
	},
});

if (!result.ok) throw new Error(result.error.message);
const map = result.value;

let state = emptyState(map);
const start = map.nodes.find((n) => n.position.row === 0)?.id ?? "";

const next = complete(map, state, start);
if (next.ok) state = next.value;

getNodeStatus(map, state, start); // "completed"
```

同じシードなら常に同じマップになる。`generate` は純粋で、`Math.random` は使わない。

## 拡張

すべての拡張はプラグイン経由で、**仕様は文字列 ID しか持たない**。GenSpec は最後まで純粋な JSON のまま:

```ts
import { createSpire } from "@edv4h/spire-core";
import { createGenPlugin, generate } from "@edv4h/spire-gen";
import { createRulesExtraPlugin } from "@edv4h/spire-plugin-rules-extra";

const spire = await createSpire({
	plugins: [createGenPlugin(), createRulesExtraPlugin()],
});
if (!spire.ok) throw new Error(spire.error.map((e) => e.message).join("\n"));

// "maxTotal" は rules-extra が登録した id。spec は JSON のまま保存できる。
await generate(
	{ /* ..., */ types: { distribution: { step: 1 }, constraints: [{ rule: "maxTotal", type: "boss", max: 2 }] } },
	{ spire: spire.value },
);
```

詳細は [`docs/plugin-system.md`](docs/plugin-system.md)。第三者スコープからの完全な実例が [`examples/acme-plugin-demo`](examples/acme-plugin-demo) にある。

## ドキュメント

| | |
|---|---|
| [`docs/smf-0.1.md`](docs/smf-0.1.md) | Spire Map Format 仕様 — 公開契約 |
| [`docs/plugin-system.md`](docs/plugin-system.md) | プラグイン作者向けガイド |
| [`docs/deviations-from-design.md`](docs/deviations-from-design.md) | 設計書からの差分と、その理由 |
| [`docs/design-v0.1.md`](docs/design-v0.1.md) | 元の設計書（歴史的資料） |

## 開発

```bash
pnpm install
pnpm build          # tsc のみ。bundler は使わない
pnpm test
pnpm typecheck
pnpm lint

# playground を起動する
pnpm --filter @edv4h/spire-playground dev

# 生成マップを ASCII で目視確認する
pnpm --filter @edv4h/spire-example-cli start -- --walks 4 --count 5
```

Node 22+ / ESM 専用 / ランタイム依存は zod のみ。`@edv4h/spire-core` は DOM・React・Node API に依存しない。

## Playground

プラグインと機能を手で触る場所。

```bash
pnpm --filter @edv4h/spire-playground dev   # http://127.0.0.1:4590
```

プラグインの ON/OFF、GenSpec の編集、ポリシーの切替、ノードのクリック、CRDT マージ、
regenerate / insertNode、レジストリの中身、SVG 書き出しがすべてここで確かめられる。
詳細は [`apps/playground`](apps/playground)。

## v0.1 で未実装

正直に書いておく。`renderToPNG` は入っていない（`renderToSVG` から先はアプリ側の依存になるため）。
`regenerate` はタイプの再割当のみで、構造は据え置き。理由は [`docs/deviations-from-design.md`](docs/deviations-from-design.md) §10。

## ライセンス

MIT
