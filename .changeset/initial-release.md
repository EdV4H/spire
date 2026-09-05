---
"@edv4h/spire-core": minor
"@edv4h/spire-gen": minor
"@edv4h/spire-layout": minor
"@edv4h/spire-render": minor
"@edv4h/spire-plugin-rules-extra": minor
"@edv4h/spire-plugin-policy-quorum": minor
---

feat: Spire SDK v0.1

ドメイン非依存のレーン型 DAG マップエンジンの初版。

- `core`: Spire Map Format (SMF 0.1)、10種の位相不変条件を検証するバリデータ、進行ステートマシン、CRDT マージ、グラフ編集、プラグインカーネル
- `gen`: StS 型の骨格生成、制約充足によるタイプ割当（停止性保証つき）、ContentProvider によるコンテンツ注入。GenSpec は 100% JSON
- `layout`: グリッド→画面座標、シード付きジッター、ベジェ経路
- `render`: レンダラ契約とデフォルトテーマ（型のみ。実装は次リリース）
- プラグイン2種と第三者スコープからの拡張デモ
