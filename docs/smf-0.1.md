# Spire Map Format 0.1

ステータス: 実装済み（`@edv4h/spire-core`）

SMF は Spire の公開契約である。パッケージ間の通信も、アプリケーションとの通信も、すべてこの2つの JSON ドキュメントを介する。実装は差し替え可能だが、フォーマットは動かない。

---

## 1. MapDocument — 構造

```jsonc
{
  "smfVersion": "0.1",
  "id": "map_9f3a",
  "seed": 42,                        // 生成シード。手書きなら null
  "grid": { "cols": 5, "rows": 12 }, // row 0 が始端、rows-1 が終端
  "nodeTypes": [
    { "id": "step", "meta": { "label": "ステップ" } }
  ],
  "nodes": [
    {
      "id": "n1",
      "type": "step",
      "position": { "col": 2, "row": 0 },
      "data": {}                     // アプリ自由領域。SDK は素通し
    }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n4" }
  ],
  "meta": {}
}
```

`type` は**利用者定義の不透明な識別子**。SDK は文字列としてしか扱わない。`data` / `meta` の中身も同様に一切解釈しない。

## 2. StateDocument — 進行状態

```jsonc
{
  "smfVersion": "0.1",
  "mapId": "map_9f3a",
  "completed": {
    "n1": { "at": "2026-08-01T10:00:00Z", "by": "user_x", "data": {} }
  },
  "meta": {}
}
```

**保存されるのはこれだけ。** 以下はすべて `@edv4h/spire-core` が map + state から計算する導出値であり、決して保存しない:

| 導出値 | 定義 |
|---|---|
| `completed` | `state.completed` にある |
| `reachable` | 未完了、かつ row 0 のノードであるか、完了ノードから直接エッジが張られている |
| `locked` | 未完了かつ reachable でない |
| `Progress` | 完了数 / 全数、比率、reachable 数、最長完了パス、終端到達済みか |

---

## 3. 位相的不変条件

`validateMap` が強制する。**すべて満たすドキュメントは、レイアウトを解かずにそのまま描画できる。** これが「レイアウト済みが契約」の実体。

| コード | 条件 |
|---|---|
| `duplicate_id` | node / edge / nodeType の id が一意 |
| `ref_integrity` | エッジの端点が実在し、`node.type` が `nodeTypes` に宣言済み |
| `position_range` | `position` がグリッド範囲内 |
| `position_collision` | 同一セルに複数ノードなし |
| `edge_direction` | すべてのエッジで `row(from) < row(to)` |
| `dag_cycle` | 閉路なし |
| `degree_in` | row 0 以外のノードは入次数 ≥ 1 |
| `degree_out` | 終端 row 以外のノードは出次数 ≥ 1 |
| `edge_crossing` | エッジの描画線分が交差しない（端点の共有は分岐・合流であって交差ではない） |
| `edge_through_node` | エッジの線分が第三のノードのセルを貫通しない |

`validateMap(doc, spire)` と `Spire` を渡すと、加えて `nodeTypes` レジストリが宣言した `node.data` スキーマと、`validators` レジストリのチェッカーも回る。

`validateMap` は**見つかった違反をすべて返す**。最初の1件で止まらない。

---

## 4. 状態のマージ

`completed` は grow-only map として設計されている。`mergeStates(a, b)` は:

- 完了の**和集合**を取る
- 両者が同じノードを主張したら **`at` が早いほうの記録**を採る
- `at` が同値なら `by` → `data` の安定シリアライズの辞書順で決定的にタイブレークする

タイブレークがあるのは、`at` の比較だけでは可換にならないため。**`mergeStates(a, b)` と `mergeStates(b, a)` は deep-equal であり、結合的かつ冪等**。これはプロパティテストで担保されている（`packages/core/src/progress/merge.test.ts`）。

未知のトップレベルフィールドも同じ規則で決定的にマージされるので、マージの可換性は `completed` だけでなくドキュメント全体で成り立つ。

---

## 5. 互換性ポリシー

`smfVersion` は semver。

- **マイナー内は後方互換**（フィールド追加のみ）
- **未知フィールドは保持して素通しする**（forward-compatible）。スキーマはすべて zod の `looseObject` で定義されており、古いリーダーが新しいドキュメントを読み書きしてもホストのデータを落とさない
- 破壊的変更はメジャーバージョン + `Migration` を同梱。`migrate(doc, spire, target)` が登録済みマイグレーションを連鎖させる

v0.1 にマイグレーションは無い。これは仕組みであって、積み残しではない。
