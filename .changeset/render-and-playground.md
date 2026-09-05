---
"@edv4h/spire-render": minor
---

feat(render): React renderer, static SVG renderer and theme resolution

`buildScene` resolves layout, status and theme into a list of shapes with final
colours; `SpireMap` and `renderToSVG` both draw only that, so a share image and
the screen cannot drift apart. Animation stays out — `onNodeStatusChange`
reports when a status moved and the application decides how to mark it.
