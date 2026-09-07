# npm への公開

`.github/workflows/release.yml` が **GitHub OIDC の trusted publishing** で npm に
publish する。長命の `NPM_TOKEN` は使わない — 認証はジョブごとに発行される短命の
トークン（`permissions: id-token: write`）で、provenance も自動で付く。

初回の publish と trusted publisher の設定は **2026-09-07 に完了済み**。以降にやる
ことは「平常運転」だけで、下のブートストラップの節は記録として残してある。

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

## 公開されたかの確認

```bash
curl -s https://registry.npmjs.org/@edv4h/spire-core/latest | jq .version
```

**`npm search` や npmjs.com の検索は使わない。** 検索インデックスは publish から
数分〜数時間遅れる別系統なので、上がっているのに「無い」と見える。メタデータ API
（上のパス）が実体。npm の CDN は 404 を短時間キャッシュするので、publish 直前に
引いた 404 がしばらく残ることもある。

trusted publisher 側の確認:

```bash
npm trust list @edv4h/spire-core --registry=https://registry.npmjs.org/
```

## 初回のブートストラップ（済み・記録）

trusted publisher は **既存のパッケージにしか付けられない**。まだ npm 上に存在しない
パッケージには付けられないので鶏卵になっており、初回だけ手で publish する必要が
あった。

```bash
npm login --scope=@edv4h --registry=https://registry.npmjs.org/

git checkout main && git pull                                # Version PR マージ後
pnpm install --frozen-lockfile
pnpm build

# pnpm publish は workspace:* を実バージョンに解決してから送る（npm publish は
# しない）。-r で依存順に6つ回る。
npm_config_allow_file=all pnpm publish -r --access public \
  --registry https://registry.npmjs.org/

./scripts/setup-npm-trusted-publishers.sh
```

### 実際に踏んだもの

- **`--registry` を渡しても認証トークンは切り替わらない → `E404` on PUT.**
  npm はトークンをレジストリの URL ごとに引くので、`~/.npmrc` に
  `//registry.npmjs.org/:_authToken` が無いと匿名で PUT して 404 になる。スコープ
  付きパッケージでは 401 ではなく **404 が「認証されていない」の意味**で返るので、
  パッケージ名の間違いに見えて紛らわしい。先に `npm login` すること。確認は
  `npm whoami --registry=https://registry.npmjs.org/`
- **`EALLOWFILE — Fetching packages of type "file" have been disabled`.**
  `pnpm publish` は tarball に固めてから `npm publish <tgz>` に渡すので、npm からは
  `file:` スペックに見える。npm の既定は `allow-file=all` なので、これが出るのは
  `~/.npmrc` がハードニングされている環境。`npm_config_allow_file=all` を前置すれば
  その1コマンドだけ上書きできる（優先順位は CLI > 環境変数 > プロジェクト npmrc >
  user npmrc）。`~/.npmrc` を書き換える必要はない
- **`--otp <6桁>` は付けない。** 2FA が有効なアカウントでは npm がブラウザ認証を
  開く。TOTP コードを渡す形にすると、6パッケージを回る間に 30 秒で切れて後半が
  `EOTP` で落ちる。最初の認証時に **「skip 2FA for the next 5 minutes」** を選ぶと、
  残りと trust スクリプトが続けて通る
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
