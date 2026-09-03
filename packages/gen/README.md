# @edv4h/spire-gen

決定的なマップ生成。同じ GenSpec + シードなら常に同じ `MapDocument` になる。

```
GenSpec ─▶ ① skeleton  グリッド + ウォークで DAG 骨格（StS 型）
        ─▶ ② assign    制約充足でノードタイプ割当
        ─▶ ③ populate  ContentProvider で node.data に注入（任意）
        ─▶ ④ validate  位相不変条件 + GenSpec 制約の最終検証
        ─▶ MapDocument
```

各段は個別にも公開している（`buildSkeleton` / `assignTypes`）。

## GenSpec は純粋な JSON

振る舞いはすべて登録済み ID で参照する。関数はどこにも入らないので、spec はそのまま保存・共有・再生できる。

```jsonc
{
  "seed": 42,
  "skeleton": { "algorithm": "sts-walks", "grid": { "cols": 5, "rows": 12 }, "walks": 4, "minStarts": 2 },
  "types": {
    "assigner": "rejection",
    "distribution": { "step": 0.7, "gate": 0.2, "bonus": 0.1 },
    "constraints": [{ "rule": "fixedRow", "row": -1, "type": "final" }]
  },
  "populate": null
}
```

## 組み込みの制約ルール

| id | 意味 |
|---|---|
| `fixedRow` | その行はその型、かつその型はその行だけ（`row: -1` は終端行） |
| `minRow` | その型は指定行以降にのみ現れる |
| `noAdjacentSame` | 指定型は隣接ノード同士で連続しない |
| `branchDistinct` | 同じ親からの分岐先は異なる型（`exempt` で除外可） |
| `maxPerRow` | 1行あたりの同型上限 |

追加のルール・骨格アルゴリズム・割当戦略・コンテンツプロバイダはプラグインで登録する。

## 始端と終端の数

| | |
|---|---|
| `minStarts` | row 0 の入口の**最小**数 |
| `maxStarts` | 入口の最大数。省略で上限なし |
| `maxEnds` | 終端行のノードの最大数。省略で上限なし |

```jsonc
// 入口1つ、ゴール1つ — 目標マップの形
"skeleton": { "grid": { "cols": 5, "rows": 12 }, "walks": 6,
              "minStarts": 1, "maxStarts": 1, "maxEnds": 1 }
```

`maxEnds` は「1歩で1列しか動けない」性質を使い、終端に近づくほど**ウォークが居られる列を
狭める**ことで実現している。全ウォークが同じ区間に制約されるので左右の順序が入れ替わらず、
絞り込みが交差を生むことがない。

## 停止性

割当は rejection sampling で、試行上限（既定 1000）と早期打ち切り（同一ノードが同一理由で25回連続ブロック）を持つ。矛盾する GenSpec は無限に回らず、**どのノードがどのルールに阻まれたか**を含むエラーで返る。

## マップの編集

| | |
|---|---|
| `insertNode(map, { type, row, col? })` | 空きセルにノードを追加する。骨格生成が `walks < cols` で列に空きを残しているのはこのため。不変条件を壊さずに繋げられなければ `no_space` を返し、勝手に壊れたマップを返さない |
| `regenerate(map, spec, { keepCompleted })` | 未完了ノードのタイプを再割当する。**構造は据え置き**。完了済みノードは type と data を保持したまま固定され、新しい spec の制約に反する場合は `map.meta.regenerateWarnings` で報告する（エラーにはしない） |
