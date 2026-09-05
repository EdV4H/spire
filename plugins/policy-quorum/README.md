# @edv4h/spire-plugin-policy-quorum

「N 本の経路が合流したら開く」進行ポリシー。組み込みの `strict` は完了した先行ノードが1つあれば開くが、これは `threshold` 個を要求する。

```ts
const spire = await createSpire({
	plugins: [createQuorumPolicyPlugin({ threshold: 2 })],
});

complete(map, state, nodeId, { policy: "quorum", spire: spire.value });
```

ポリシーが ID で引かれることの意味はここにある。ホストは自分の設定 JSON に `{ "policy": "quorum" }` と書くだけでよく、ルールが変わってもアプリケーションのコードパスは変わらない。

`allowUnderfilled`（既定 true）は、先行ノードが `threshold` より少ないノードを threshold で締め上げないためのもの。これが無いと、1本道でしか到達できないノードは threshold 2 で永久に開かない。
