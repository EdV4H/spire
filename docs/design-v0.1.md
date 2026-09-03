# Spire SDK 設計書 v0.1

Date: 2026-08-05
参照: Spire PRD v0.2 / マップ生成アルゴリズム調査レポート v0.1
Status: Draft（実装は v0.1 で一部変更。差分は `docs/deviations-from-design.md`）

## 1. 設計方針

### 1.1. スコープ: ドメイン非依存の「レーン型DAGマップ」エンジン

Spire SDKは**「目標」「クエスト」「踏破」といった意味論を一切持たない**。SDKが知っているのは以下だけ:

- レーン構造(グリッド)上に配置された**ノード**と、それらを繋ぐ**エッジ**からなるDAG
- ノードは**タイプ**を持つが、タイプはSDK利用者が定義する不透明な識別子(ただの文字列)
- ノードとマップの**進行状態**(未到達/到達可能/完了)という位相的な概念

「Summitは目標である」「クエストを完了すると祝う」といった解釈はすべてアプリ層(Spireアプリ、将来のScenario等)の責務。これによりSDKは、目標達成マップにも、学習カリキュラムにも、オンボーディングフローにも、ゲームのステージマップにも使える。

### 1.2. 設計原則

1. **Format is the contract:** すべてのパッケージはSpire Map Format(宣言的JSON)を介して通信する。フォーマットが公開契約であり、実装は差し替え可能
2. **構造と状態の分離:** マップ定義(不変に近い)と進行状態(高頻度に変わる)は別ドキュメント
3. **決定的生成:** 同じ入力+シード→同じマップ。生成は純関数
4. **レイアウト済みが契約:** フォーマットはグリッド座標を含む。レンダラはレイアウトを解かない(調査レポート4章)
5. **ヘッドレスコア:** spire-coreはDOM・React・Node API非依存。どの環境でも動く
6. **拡張はデータで:** ノードタイプ・生成ルール・テーマはすべて宣言的な設定として注入する。SDKのコード変更なしに新しいドメインへ適用できる

### 1.3. パッケージ構成

```
@spire/core     — Map Format型定義・バリデータ・進行ステートマシン・グラフ操作
@spire/gen      — スケルトン生成(StS型)・タイプ割当(制約充足)・コンテンツ注入
@spire/render   — Reactレンダラ・テーマシステム・静的画像レンダラ(SVG/Canvas)
```

依存方向: `render → core ← gen`(genとrenderは互いを知らない)

## 2. Spire Map Format(SMF)

### 2.1. MapDocument(構造)

```jsonc
{
  "smfVersion": "0.1",
  "id": "map_9f3a",
  "seed": 42,                        // 生成時シード(再現用・手動作成ならnull)
  "grid": { "cols": 5, "rows": 12 }, // レーン構造。row 0が始端、最終rowが終端
  "nodeTypes": [                     // 利用者定義。SDKは意味を解釈しない
    { "id": "step",  "meta": { "label": "ステップ" } },
    { "id": "gate",  "meta": { "label": "チェックポイント" } },
    { "id": "final", "meta": { "label": "ゴール" } }
  ],
  "nodes": [
    {
      "id": "n1",
      "type": "step",
      "position": { "col": 2, "row": 0 },
      "data": {}                     // アプリ自由領域(タイトル・説明・期限など)。SDKは素通し
    }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n4" }
  ],
  "meta": {}                         // マップ全体のアプリ自由領域
}
```

**位相的不変条件**(バリデータが強制):

- DAGであること(閉路なし)。エッジは必ず `row(from) < row(to)`
- エッジの描画線分が交差しないこと(グリッド座標から検証可能)
- 始端row以外のすべてのノードは入次数≥1、終端row以外は出次数≥1(孤立・行き止まりなし)
- `position` はグリッド範囲内かつ同一セルに複数ノード不可

### 2.2. StateDocument(進行状態)

```jsonc
{
  "smfVersion": "0.1",
  "mapId": "map_9f3a",
  "completed": {                     // 完了ノードと任意の記録
    "n1": { "at": "2026-08-01T10:00:00Z", "by": "user_x", "data": {} }
  },
  "meta": {}
}
```

状態はこれだけ。以下はすべて**導出値**であり、保存しない(spire-coreが計算):

- `reachable`: 未完了かつ、始端ノードであるか完了ノードから直接エッジが張られている
- `locked`: 未完了かつreachableでない
- `progress`: 完了数/全ノード数、最長完了パス、終端到達済みか等

複数人での同時更新を想定し、`completed` はCRDT的にマージ可能(和集合+at最小値優先)な構造とする。

### 2.3. 互換性ポリシー

`smfVersion` はsemver。マイナーバージョン内では後方互換(フィールド追加のみ)。未知フィールドは保持して素通し(forward-compatible)。破壊的変更はメジャーバージョン+マイグレータ(`migrate(doc): doc`)を同梱。

## 3. @spire/core

```ts
// バリデーション
validateMap(doc: unknown): Result<MapDocument, ValidationError[]>
validateState(doc: unknown, map: MapDocument): Result<StateDocument, ValidationError[]>

// 進行ステートマシン(すべて純関数)
getNodeStatus(map, state, nodeId): "completed" | "reachable" | "locked"
complete(map, state, nodeId, record?): Result<StateDocument, RuleViolation>
  // デフォルトはreachableのみ完了可。ポリシーで緩和可能(後述)
uncomplete(map, state, nodeId): StateDocument
getProgress(map, state): Progress
mergeStates(a, b): StateDocument   // CRDTマージ

// グラフ操作(編集用・すべて新ドキュメントを返す)
addNode(map, node): Result<MapDocument, ...>      // 不変条件を検証
removeNode(map, nodeId): Result<MapDocument, ...> // 接続の張り直し込み
addEdge / removeEdge / moveNode / updateNodeData ...
paths(map): NodeId[][]             // 始端→終端の全パス列挙
```

**進行ポリシー:** `complete` の可否判定は `ProgressionPolicy`(`"strict"` = reachableのみ / `"free"` = いつでも / カスタム述語)として注入可能。「誰でも踏破操作可」のようなアプリ判断はここに載せる。

## 4. @spire/gen

### 4.1. パイプライン

```
GenSpec ──▶ ① skeleton: グリッド+ウォークでDAG骨格生成(StS型)
        ──▶ ② assign:   制約充足でノードタイプ割当(rejection sampling)
        ──▶ ③ populate: コンテンツ注入(node.dataへ、任意)
        ──▶ ④ validate: 2.1の不変条件+GenSpec制約の最終検証
        ──▶ MapDocument
```

各ステップは独立した純関数としても公開する(骨格だけ欲しい、割当だけやり直したい、に対応)。

### 4.2. GenSpec(生成仕様)

```jsonc
{
  "seed": 42,
  "skeleton": {
    "grid": { "cols": 5, "rows": 12 },
    "walks": 4,                     // ウォーク本数(分岐・合流の密度)
    "minStarts": 2,                 // 始端ノードの最小数
    "connectivity": "closest3"      // 次rowへの接続候補(StS準拠)
  },
  "types": {
    "distribution": { "step": 0.7, "gate": 0.2, "bonus": 0.1 },
    "constraints": [
      { "rule": "fixedRow",        "row": -1, "type": "final" },     // 最終rowは必ずfinal
      { "rule": "fixedRow",        "row": 0,  "type": "step" },
      { "rule": "minRow",          "type": "gate", "row": 3 },       // gateはrow3以降
      { "rule": "noAdjacentSame",  "types": ["gate", "bonus"] },     // 同種連続禁止
      { "rule": "branchDistinct" }                                   // 分岐先は異タイプ
    ]
  },
  "populate": null                  // または ContentProvider(4.3)
}
```

制約ルールは判別可能ユニオンとして型定義し、**バリデータと生成器が同じルール定義を共有**する(生成後の編集でも同じ制約を検査できる)。カスタムルールは述語関数として注入可能。

このGenSpec全体が「テーマ」としてシリアライズ可能 = アプリ層のScenarioテンプレートの実体。

### 4.3. ContentProvider(コンテンツ注入)

```ts
interface ContentProvider {
  provide(slots: NodeSlot[]): Promise<NodeContent[]>
  // NodeSlot = { nodeId, type, row, branchGroup? } — 構造情報のみ渡す
  // NodeContent = { nodeId, data } — node.dataに入る
}
```

LLM統合はSDKに**含めない**。アプリ側がLLM呼び出しをContentProviderとして実装する(調査レポート5章のパイプラインの①をアプリ側に置く)。SDKはスロット情報の提供と注入結果の検証のみ行う。これによりSDKはLLMプロバイダ・プロンプト設計・ドメイン知識から自由になる。

### 4.4. 再生成・部分更新

- `regenerate(map, spec, { keepCompleted: state })`: 完了済みノードを保持したまま未完了領域を再生成(マップの途中変更対応の第一段)
- 骨格生成は列に空きが出る設計(walks < cols)のため、`insertNode` による交差なし挿入は空きセル優先で行う。空きがない場合はエラーを返し、アプリに再生成を促す(v0.1では無理をしない)

## 5. @spire/render

### 5.1. Reactレンダラ

```tsx
<SpireMap
  map={mapDoc}
  state={stateDoc}
  theme={theme}
  orientation="bottom-up"          // bottom-up | top-down | left-right | right-left
  onNodePress={(nodeId) => ...}
  renderNode={(node, status) => ...}  // 任意のカスタム描画(escape hatch)
/>
```

- グリッド座標→画面座標の変換+シード付きジッター(有機的な見た目、再現可能)
- エッジはベジェ曲線。完了パスの強調はテーマ側で定義
- 縦長マップのスクロール・現在地へのオートフォーカスを内蔵
- アニメーション(完了演出等)は**フックのみ提供**(`onNodeStatusChange`)。演出自体はアプリ側

### 5.2. テーマ

```ts
interface SpireTheme {
  node: Record<NodeTypeId | "default", NodeStyle>   // status別スタイル含む
  edge: EdgeStyle
  background?: LayerRenderer
  jitter: { amount: number }
  spacing: { col: number; row: number }
}
```

タイプIDとテーマの対応はアプリが与える。SDK同梱はニュートラルなデフォルトテーマ1種のみ(デザイン探索の結果を将来テーマ化)。

### 5.3. 静的レンダラ(シェア画像の土台)

```ts
renderToSVG(map, state, theme, opts): string   // 環境非依存
renderToPNG(...)                                // Canvas/サーバーサイド
```

Reactレンダラと同じレイアウト計算を共有する(レイアウトモジュールはcore寄りの共通内部パッケージに置く)。シェア画像の装飾(チーム名・日数等)はアプリ層。

## 6. テスト戦略

- **決定性:** 同一GenSpec+シードで完全一致のスナップショットテスト
- **プロパティベーステスト:** ランダムなGenSpec空間に対し、生成物が常に2.1の不変条件を満たすことを検証(fast-check等)
- **制約充足の停止性:** rejection samplingに試行上限を設け、充足不能なGenSpec(矛盾する制約)は明示的エラーで返すことをテスト
- **ステートマシン:** complete/uncomplete/mergeの可換性・冪等性テスト
- **ビジュアルリグレッション:** renderToSVGのスナップショット

## 7. 非スコープ(v0.1)

- 汎用DAG自動レイアウト(グリッド座標なしの入力は受けない。需要が出たらd3-dag等の変換アダプタを別パッケージで)
- リアルタイム同期・永続化(StateDocumentのマージ関数までは提供、転送・保存はアプリ)
- LLM呼び出し(ContentProviderインターフェースまで)
- アニメーション実装・React以外のレンダラ(Web Componentsは外部公開時に検討)
- 認証・チーム・通知などアプリドメイン全般

## 8. オープン論点

1. グリッドを三角格子(StS準拠・見た目が有機的)にするか矩形格子(実装単純)にするか → v0.1は矩形+ジッターで開始し、見た目はデザイン検証に委ねる
2. 「合流後の再分岐」を許すStS方式で、現実の計画として不自然なグラフが出る率 → αでGenSpecパラメータ(walks数)の実用域を特定
3. StateDocumentのCRDTをどこまで厳密にやるか(タイムスタンプ和集合で十分か)
4. レイアウト計算の置き場所(core/render間の共通内部パッケージ `@spire/layout` を切るか)
5. 外部公開時のパッケージ名前空間・ライセンス(PRD 11章の論点と連動)

---

*v0.1 — 2026-08-05 / 「目標」等の意味論をSDKから排除し、ノードタイプを利用者定義の不透明な識別子とする方針で初版作成。*
