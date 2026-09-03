# @edv4h/spire-render

**v0.1 は型とデフォルトテーマのみ。** React コンポーネント・`renderToSVG` / `renderToPNG` は未実装で、次のリリースで入る。

このパッケージが今あるのは、契約が固まっており `@edv4h/spire-layout` もアプリ側のコードもその型に対して書かれているため。**何も no-op で握り潰していない。呼べるものがまだ無いだけ。**

現時点で使えるもの:

```ts
import { defaultTheme, resolveEdgeStyle, resolveNodeStyle } from "@edv4h/spire-render";
import type { SpireMapProps, SpireTheme, StaticRenderOptions } from "@edv4h/spire-render";
```

`SpireTheme.node` は `default` が必須。テーマがホスト定義の型を styling し忘れることは型レベルで起きない。
