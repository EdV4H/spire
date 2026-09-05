# @edv4h/spire-plugin-rules-extra

制約ルールを3つ追加する。

| id | 意味 |
|---|---|
| `maxTotal` | `{ type, max }` — マップ全体でその型は最大 N 個 |
| `rowRange` | `{ type, minRow?, maxRow? }` — その型は行の窓の中だけ（負値は終端からの相対） |
| `afterTypes` | `{ type, after }` — その型は指定型のいずれかの直後にのみ置ける |

```ts
const spire = await createSpire({
	plugins: [createGenPlugin(), createRulesExtraPlugin()],
});
```

`@edv4h/spire-gen` に依存を宣言しているので、プラグイン配列の順序は問わない。カーネルがトポロジカルにソートする。
