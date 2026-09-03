# @edv4h/spire-core

Spire Map Format、バリデータ、進行ステートマシン、グラフ操作、プラグインカーネル。

DOM・React・Node API に依存しない。ランタイム依存は `zod` のみ。

## 主なエクスポート

```ts
// 検証
validateMap(doc: unknown, spire?: Spire): Result<MapDocument, ValidationError[]>
validateState(doc: unknown, map: MapDocument): Result<StateDocument, ValidationError[]>
checkInvariants(map: MapDocument): ValidationError[]

// 進行（すべて純関数）
getNodeStatus(map, state, nodeId): "completed" | "reachable" | "locked"
getProgress(map, state): Progress
complete(map, state, nodeId, options?): Result<StateDocument, RuleViolation>
uncomplete(state, nodeId): StateDocument
mergeStates(a, b): StateDocument        // 可換・結合的・冪等

// グラフ（すべて新ドキュメントを返し、不変条件を再検査する）
addNode / removeNode / addEdge / removeEdge / moveNode / updateNodeData / setNodeType
paths(map, { limit }): { paths: NodeId[][]; truncated: boolean }
buildIndex(map): MapIndex

// プラグイン
createSpire({ plugins }): Promise<Result<Spire, PluginError[]>>
createRegistry<T>(kind): InternalRegistry<T>
defineService<T>(key): ServiceHandle<T>

// 決定性
createRng(seed): Rng
```

エラーは投げない。想定される失敗はすべて `Result` で返り、SDK はログを出さない。

詳細は [`docs/smf-0.1.md`](../../docs/smf-0.1.md) と [`docs/plugin-system.md`](../../docs/plugin-system.md)。
