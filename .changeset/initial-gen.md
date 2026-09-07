---
"@edv4h/spire-gen": minor
---

GenSpec からマップを生成するパイプライン。

- **骨格** — Slay the Spire 型のウォーク。交差する候補は生成時点で弾くので、バリデータに掛ける前から非交差不変条件を満たしている
- **タイプ割当** — 分布と制約による rejection sampling。矛盾する spec は無限に回らず、どのノードがどのルールに阻まれたかを名指しして止まる
- **コンテンツ注入** — `ContentProvider` を id で参照する。SDK にドメイン知識は入らない
- 組み込みルール5種（`fixedRow` / `minRow` / `noAdjacentSame` / `branchDistinct` / `maxPerRow`）と `regenerate` / `insertNode`

既定は**入口1つ・ゴール1つ**。`minStarts` / `maxStarts` / `maxEnds` で変えられ、`null` で上限を外す。ゴールを絞る処理は、終端行に近づくにつれてウォークが取れる列を狭めることで実現している。区間は全ウォークで共有されるので左右の順序が保たれ、**絞り込みが交差を生むことがない**。

**GenSpec は 100% JSON。** 骨格アルゴリズム・割当器・ルール・コンテンツ供給のどれも文字列 id で参照するので、spec をそのまま保存・共有でき、振る舞いはプラグインで差し替えられる。

`seed` が同じなら常に同じマップが出る（`Math.random` は使わない）。
