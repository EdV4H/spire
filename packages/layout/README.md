# @edv4h/spire-layout

グリッド座標から画面座標への変換。描画はしない。

```ts
layout(map, {
	orientation: "bottom-up",           // top-down | left-right | right-left
	spacing: { col: 96, row: 120 },
	jitter: { amount: 8 },              // seed 省略時は map.seed → 再現可能
	curvature: 0.45,
}): LayoutResult
```

React レンダラと `renderToSVG` が**同一のレイアウト計算**を共有するために独立している。シェア画像が画面と食い違うのは最悪の壊れ方なので、この計算は1箇所にしかない。

ジッターはノード ID をキーにしている。ノードを1つ足しても他のノードの見た目は動かない。

DOM・React に依存しない。
