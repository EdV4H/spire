# プラグインシステム

作成日: 2026-09-03
ステータス: 実装済み（plugin API v1）

Spire の拡張はすべてプラグイン経由で行う。このドキュメントは**実装されているものだけ**を書く。

---

## 1. なぜプラグインなのか

設計原則6は「拡張はデータで」。つまり **GenSpec や進行ポリシーの指定は JSON のまま保存・共有・再生できる**べきということ。一方で振る舞いを差し替えるにはコードが要る。

プラグインはこの2つを繋ぐ:

| 保存されるもの | 解決されるもの |
|---|---|
| `{ "rule": "acme:spacing", "gap": 2 }` | `rules` レジストリの `acme:spacing` |
| `{ "policy": "quorum" }` | `policies` レジストリの `quorum` |
| `{ "populate": "acme:llm-copy" }` | `contentProviders` レジストリの `acme:llm-copy` |
| `{ "algorithm": "sts-walks" }` | `skeletons` レジストリの `sts-walks` |

**仕様は文字列 ID しか持たない。** 実装はホストがどのプラグインを読み込んだかで決まる。

---

## 2. プラグインの契約

```ts
export interface SpirePlugin {
	readonly id: string;
	readonly name: string;
	readonly apiVersion: typeof SPIRE_PLUGIN_API_VERSION;   // 現在 1
	readonly dependencies?: readonly string[];
	setup(ctx: PluginContext): PluginTeardown | void | Promise<PluginTeardown | void>;
}
```

これで全部。**種別の判別子は無い。** 何のプラグインかは `ctx` のどのレジストリに登録したかで決まる。

### 守るべき2つのルール

**1. 必ずファクトリ関数から返す。**

```ts
// ✅
export function createMyPlugin(options: MyOptions = {}): SpirePlugin {
	return { id: "...", name: "...", apiVersion: SPIRE_PLUGIN_API_VERSION, setup(ctx) { ... } };
}

// ❌ モジュールレベルのシングルトン
export const myPlugin: SpirePlugin = { ... };
```

同じプロセスで2つの `createSpire` が走ったとき、シングルトンだと状態が共有される。

**2. teardown は `setup` の戻り値で返す。`this` に溜めない。**

```ts
setup(ctx) {
	const off = ctx.policies.register(myPolicy);
	return off;                     // ✅ このインスタンス専用のクロージャ
}
```

`this` に溜めると、2回目の `setup` が1回目のクロージャを上書きし、1つめのインスタンスの `destroy()` が**生きている2つめ**を壊す。

---

## 3. レジストリ

### core が持つもの（`PluginContext`）

| 名前 | 登録するもの |
|---|---|
| `nodeTypes` | `NodeTypeDefinition` — `node.data` の zod スキーマ、表示用 meta |
| `validators` | `MapValidator` — `validateMap` が追加で回す構造チェック |
| `policies` | `ProgressionPolicyDefinition` — `complete` の可否判定 |
| `migrations` | `Migration` — `smfVersion` の1段階アップグレード |
| `events` | `EventBus` — 通知 |
| `services` | `ServiceRegistry` — 汎用 IoC |
| `plugins` | 読み取り専用のプラグイン一覧 |

カーネルは3つの進行ポリシーを最初から登録している。厳しい順:

| id | 許すもの |
|---|---|
| `single-route` | **既定。** 完了集合が1本の道であり続ける限り。分岐の片方を通ると、もう片方は閉じる |
| `strict` | reachable なノード。分岐はすべて踏破できる |
| `free` | 何でも |

「いま実際に完了できるノード」は `getCompletableNodes(map, state, { policy })` で引ける。
`getReachableNodes` は構造的な問い（完了した先行ノードがあるか）に答えるもので、ポリシーを
知らない — レンダラが色を決めるのはこちらである。`single-route` の下では、通らなかった側の
分岐は **reachable のままで completable ではない**。

### gen が持つもの（`getGenRegistries(ctx.services)`）

| 名前 | 登録するもの |
|---|---|
| `rules` | `ConstraintRule` — GenSpec の `constraints[].rule` |
| `skeletons` | `SkeletonAlgorithm` — `skeleton.algorithm` |
| `assigners` | `TypeAssigner` — `types.assigner` |
| `contentProviders` | `ContentProvider` — `populate` |

これらが `PluginContext` に無いのは意図的で、`@edv4h/spire-core` は「生成」という概念を知らない。マップを読んで検証するだけのホストが生成器を抱える理由はない。

### レジストリ共通の振る舞い

- `register(entry)` は **unregister クロージャを返す**（`Result` ではない。プラグインのコードが直線的に書けるほうが大事）
- 同じ id の重複登録は**エラー**。登録は no-op になり、`createSpire` が失敗する。`{ override: true }` を明示したときだけ置き換わる
- unregister には stale ガードがある。古いクロージャが後から呼ばれても、同じ id で登録し直された新しいエントリは消えない
- `getAll()` は防御的コピーを返す

---

## 4. `defineService` — プラグイン間 / ホスト向け API

```ts
export interface MapApi { focus(nodeId: string): void }
export const mapService = defineService<MapApi>("@acme/map");

// 提供側
setup(ctx) {
	return mapService.provide(ctx.services, { focus: (id) => { ... } });
}

// 消費側（提供側のパッケージを import しない）
setup(ctx) {
	mapService.get(ctx.services)?.focus("n1");
}
```

`ctx.services` と `spire.services` は同一オブジェクトなので、同じアクセサがプラグイン間でもホスト↔プラグイン間でも効く。

id で引くレジストリと違い、**service キーへの上書きは許される**。service キーの所有者は1つという規約で運用し、どのプラグインを読むかはホストの明示的な選択だから。レジストリ id は保存された仕様から引かれるので、静かに置き換わると保存済みの GenSpec の意味が変わってしまう — そこだけは厳格にしてある。

---

## 5. ライフサイクル

1. `apiVersion` と id 重複を検査
2. `dependencies` で**トポロジカルソート**（配列順ではない）。欠落・循環は明示エラー
3. 依存順に**逐次 `await`** で `setup`
4. 各プラグインには**自分の id にスコープされた `ctx`** が渡る。登録エントリには自動で `pluginId` が刻まれる。スコープは spread ではなく明示メソッドラッパで作られているので、カーネル専用メソッドは `as any` でも掴めない
5. `setup` ごとにレジストリの conflict を回収。conflict は `setup` の throw と同じ扱い
6. 失敗したら収集済み teardown を **LIFO** で巻き戻し、見つかった全エラーを返す
7. `destroy()` は LIFO・冪等。teardown の失敗は**投げずに配列で返す**

---

## 6. 設定の検証

カーネルはプラグイン設定を検証しない。ファクトリ引数として受け取り、zod で自前に検証する — この形で統一する:

```ts
export const myConfigSchema = z.looseObject({ threshold: z.int().positive().default(2) });
export type MyConfigInput = z.input<typeof myConfigSchema>;
export function parseMyConfig(input?: MyConfigInput) { return myConfigSchema.parse(input ?? {}); }

export function createMyPlugin(input?: MyConfigInput): SpirePlugin {
	const config = parseMyConfig(input);
	...
}
```

参照実装: `plugins/policy-quorum/src/index.ts`

---

## 7. 完全な実例

- `plugins/rules-extra` — gen のレジストリを拡張（制約ルール3つ）
- `plugins/policy-quorum` — core のレジストリを拡張（進行ポリシー）
- `examples/acme-plugin-demo` — **`@edv4h` の外**のパッケージから、公開 API だけで node type / rule / policy / content provider / service を全部足す。ここが壊れたら公開 API が壊れたということ

---

## 8. usketch から意図的に変えた点

このシステムは `~/Projects/usketch` の実装を下敷きにしている。そのまま採ったのは、3フィールド契約・ファクトリ規約・teardown の戻り値・LIFO・スコープ付き ctx・`defineService`・防御的コピー・stale ガード。

変えたのは向こうが実際に困っている点だけ:

| usketch | Spire | 理由 |
|---|---|---|
| 依存解決なし。配列順が依存グラフで、順序はホスト側のコメントで管理 | `dependencies` + トポロジカルソート。欠落・循環は明示エラー | 順序事故がプラグイン数に比例して増える |
| 重複 id は silent last-write-wins | 重複はエラー。`{ override: true }` のときだけ置換 | 静かな上書きは追跡不能 |
| `setup` の throw がアプリ生成ごと落とす | `Result<Spire, PluginError[]>` | SDK はホストに判断を返すべきで、投げてはいけない |
| `ShapeRegistry` / `ToolRegistry` だけ unregister が無い | 全レジストリで対称 | LIFO teardown 契約との不整合 |
| API バージョン交渉なし | `apiVersion` 必須、不一致は拒否 | フォーマットを公開契約にする以上、実装側にも要る |
| `console.error` + 防御的 try/catch | `Result` に集約、ログは出さない | ヘッドレス SDK が stdout を汚さない |
