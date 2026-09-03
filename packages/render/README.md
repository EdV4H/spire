# @edv4h/spire-render

React レンダラ、静的 SVG レンダラ、テーマ。

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

## 1つの Scene から2つのレンダラ

`buildScene(map, state, options)` がレイアウト・状態・テーマを解決して、色まで
決まった図形のリストを返す。React コンポーネントと `renderToSVG` は**これしか
見ない**。シェア画像が画面と食い違うのは最悪の壊れ方なので、どこに何をどの色で
描くかを決める場所を1つに絞ってある。テストでも両者のジオメトリ一致を検証している。

`renderToSVG` は DOM を触らないのでサーバでも動く。

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
