# @edv4h/spire-core

## 0.1.0

### Minor Changes

- 659e99b: Spire Map Format (SMF 0.1) と、その上の検証・進行・プラグインカーネル。

  - **SMF 0.1** — 構造（`MapDocument`）と進行状態（`StateDocument`）を別ドキュメントに分けた宣言的 JSON。スキーマはすべて loose なので、新しいマイナーバージョンで書かれたドキュメントを読んでも未知フィールドを落とさない
  - **検証** — 10 種の位相不変条件（DAG・下向きエッジ・エッジ交差・第三のノードの貫通・次数・位置・参照整合性・id 重複）。プラグインが検証を足せる
  - **進行** — 保存するのは `completed` だけで、`reachable` / `locked` / `Progress` はすべて導出。進行ポリシーは `single-route`（既定。完了集合が 1 本の道であり続ける限り）/ `strict`（reachable なら分岐をすべて踏破できる）/ `free` の 3 つが組み込みで、ポリシーは id で差し替えられる
  - **CRDT マージ** — `mergeStates` は完了の和集合、`at` の小さい方を採用し、決定的にタイブレークする。可換・結合・冪等（property test で担保）
  - **グラフ** — 索引・編集（毎回不変条件を再検査）・経路列挙（上限つき）
  - **プラグインカーネル** — 3 フィールドの契約、依存のトポロジカルソート、LIFO teardown、`defineService` による IoC。失敗は投げずに `Result` で返す

  エラーは投げずログも出さない。想定される失敗はすべて `Result<T, E>`。
