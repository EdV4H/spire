# npm への公開

`.github/workflows/release.yml` が **GitHub OIDC の trusted publishing** で npm に
publish する。長命の `NPM_TOKEN` は使わない — 認証はジョブごとに発行される短命の
トークン（`permissions: id-token: write`）で、provenance も自動で付く。

## 公開するもの（6パッケージ）

```
@edv4h/spire-core
@edv4h/spire-gen
@edv4h/spire-layout
@edv4h/spire-render
@edv4h/spire-plugin-rules-extra
@edv4h/spire-plugin-policy-quorum
```

`apps/playground`・`examples/*` は `private: true` なので publish されない。
`@acme/spire-onboarding` は第三者スコープからの拡張が成立する証明であって配布物では
ないため、`.changeset/config.json` の `ignore` にも入れてある（private パッケージが
バージョンだけ上がって release PR を汚すのを防ぐ）。

## 平常運転

1. 変更に changeset を添える（`pnpm changeset`）
2. main にマージすると Release ワークフローが **「🎉 release: Version Packages」PR**
   を作る。バージョンを上げ、CHANGELOG を書き、changeset を消化した内容
3. その PR をマージすると同じワークフローが `pnpm release`
   （`pnpm build && changeset publish`）を実行して npm に publish し、
   パッケージごとの git tag と GitHub Release を作る

つまり **publish を人が叩くことはない**。マージが唯一のトリガーであり、
何が出るかは Version PR の差分として事前にレビューできる。

## 初回だけ必要なこと（ブートストラップ）

trusted publisher は **既存のパッケージにしか付けられない**。まだ npm 上に存在しない
パッケージに `npm trust` すると 403 が返る。鶏卵になっているので、初回だけ手で
publish する必要がある。

```bash
npm install -g npm@latest                                    # npm >= 11.15
npm login --scope=@edv4h --registry=https://registry.npmjs.org/

git checkout main && git pull                                # Version PR マージ後
pnpm install --frozen-lockfile
pnpm build

# pnpm publish は workspace:* を実バージョンに解決してから送る（npm publish は
# しない）。-r で依存順に6つ回る。
pnpm publish -r --access public --registry https://registry.npmjs.org/ --otp <6桁>
```

publish できたら trusted publisher を設定する。以降 CI が publish できるようになる:

```bash
./scripts/setup-npm-trusted-publishers.sh
```

### 詰まりどころ

- **`~/.npmrc` の private registry → 405.** `@edv4h` を社内 registry に向けている
  場合、`npm trust` はそちらを叩いて `405 Method Not Allowed` になる（trusted
  publishing 非対応）。`--registry https://registry.npmjs.org/` を必ず渡す。
  スクリプトは渡している
- **`NPM_TOKEN` は置かない。** ワークフローに `NODE_AUTH_TOKEN` を渡すと npm は
  OIDC より先にそれを試すので、古いトークンが1つあるだけで publish が壊れる

## usketch の release.yml から削ったもの

usketch の同名ワークフローには、tag の push 失敗を後から回収する
「Reconcile git tags」「Reconcile GitHub Releases」「Verify publish succeeded」の
3ステップ（約100行）がある。あれは `changeset publish` が **パッケージごとに
個別の `git push origin <tag>`** を撃つため、80以上の連続 push が GitHub 側の
`remote: fatal error in commit_refs` を散発的に踏むから必要だったもの。

Spire は6パッケージなので、その失敗モードが起きない。起きない障害への回避策を
持ち込むのは、動かないコードを抱えるのと同じなので入れていない。**パッケージが
数十に増えたらここを見直すこと。**
