# @edv4h/spire-render

React レンダラ、静的 SVG レンダラ、テーマ。ノード・エッジ・レイヤの描き方と、
描画バックエンドそのものを差し替えられる。

```tsx
import { SpireMap, renderToSVG, defaultTheme } from "@edv4h/spire-render";

<SpireMap
	map={map}
	state={state}
	theme={myTheme}
	orientation="bottom-up"
	onNodePress={(nodeId) => ...}
	onNodeStatusChange={({ nodeId, from, to }) => ...}
	focusNodeId={currentNodeId}
/>;

const svg = renderToSVG(map, state, { theme: myTheme, scale: 2, title: "Q3 map" });
```

`scale` は描画サイズだけを倍率で変える。`viewBox` はレイアウトの自然なサイズのままな
ので、拡大してもレイアウトは走り直さない。React と `renderToSVG` で同じ意味。

## 1つの Scene から2つのレンダラ

`buildScene(map, state, options)` がレイアウト・状態・テーマを解決して、色まで
決まった図形のリストを返す。React コンポーネントと `renderToSVG` は**これしか
見ない**。シェア画像が画面と食い違うのは最悪の壊れ方なので、どこに何をどの色で
描くかを決める場所を1つに絞ってある。テストでも両者のジオメトリ一致を検証している。

`renderToSVG` は DOM を触らない。ただし**メインの入口は `SpireMap` を re-export
するので、import した時点で React を読む** — `renderToSVG` しか呼ばなくても。
React を持たないサーバは `headless` を使う:

```ts
import { renderToSVG, createRenderPlugin } from "@edv4h/spire-render/headless";
```

React を import する3ファイル（`SpireMap` / `Shapes` / SVG バックエンド）を除いた
だけで、他はすべて同じものが同じ identity で入っている。React は optional peer に
してあるので、インストールも要らない。CI の `pnpm check:packaging` が、react を
解決できない Node で実際に import して確かめている。

## 描画を差し替える

ノード・エッジ・レイヤの描き方はレジストリに登録して id で選ぶ。プラグインを
`createSpire` に渡し、テーマがその id を名指しする:

```ts
const crown: NodeRenderer = {
	id: "boss-crown",
	// ノードの中心に translate 済みの座標系で、原点まわりに描く
	draw: (node) => [
		{ shape: "rect", x: -14, y: -14, width: 28, height: 28, rx: 6, fill: node.fill },
		{ shape: "text", text: String(node.data?.title ?? ""), anchor: "middle" },
	],
};

const spire = await createSpire({ plugins: [createRenderPlugin({ nodeRenderers: [crown] })] });

const theme: SpireTheme = {
	...defaultTheme,
	node: { ...defaultTheme.node, boss: { ...defaultTheme.node.default, renderer: "boss-crown" } },
};

<SpireMap map={map} state={state} theme={theme} spire={spire} />;
```

レンダラは React 要素ではなく**図形を返す**。だから `renderToSVG` も同じものを描け、
カスタムの見た目でもシェア画像が画面と一致する。関数ではなく **id で選ぶ**ので、
テーマは JSON のままでいられる。

未登録の id は組み込みの見た目にフォールバックする。テーマがマップを白紙にできては
いけないので、エラーにはしない。

レイヤ（`LayerRenderer`）はマップ全体に1回だけ描く。`place` が `"background"`
ならエッジの下、`"overlay"` ならノードの上。行ガイドや列の帯のような背景を、
ノードを1つずつ細工せずに足せる。どのレイヤを出すかは `theme.layers`。

`renderNode` は JSX を返す逃げ道として残っているが、**React でしか動かない** —
`renderToSVG` は実行できない。`foreignObject` など本当に React が要るときだけ。

## バックエンド

`Scene → Shape[]` はバックエンドに依存しないので、最後の一手だけ差し替えられる。
SVG が組み込みで既定:

```tsx
<SpireMap map={map} state={state} spire={spire} backend="my-canvas" />
```

SVG はノードごとに要素があるのでキーボードで辿れる。canvas は DOM が1要素で済む
代わりにそれができない。`RenderBackend.keyboardAccessible` がどちらかを申告するので、
選ぶ場所で代償が見える。既定が SVG なのもこのため。

## テーマ

`SpireTheme.node` はノードタイプ ID → スタイルの対応で、`default` が必須。
タイプ ID は利用者定義の不透明な文字列なので、`gate` がどう見えるべきかは
アプリケーションだけが知っている — SDK 同梱の `defaultTheme` はニュートラル1色のみ。

## アニメーションは入っていない

`onNodeStatusChange` で**いつ**変わったかは報せるが、**どう**祝うかは提供しない。
完了演出はプロダクトの判断であり、焼き込むとすべての Spire マップが同じ製品の
顔になる。

## 未実装

`renderToPNG`。ブラウザなら `renderToSVG` の出力を `Image` + Canvas に通せば済み、
サーバなら resvg などの選択がアプリ側の依存になる。SDK が決め打ちする理由が無い。
