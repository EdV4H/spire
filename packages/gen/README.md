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

## 停止性

割当は rejection sampling で、試行上限（既定 1000）と早期打ち切り（同一ノードが同一理由で25回連続ブロック）を持つ。矛盾する GenSpec は無限に回らず、**どのノードがどのルールに阻まれたか**を含むエラーで返る。
