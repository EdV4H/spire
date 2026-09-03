---
"@edv4h/spire-render": patch
---

fix(render): focusing a node no longer scrolls the host page

`focusNodeId` used `element.scrollIntoView`, which walks up and scrolls every
scrollable ancestor including the document. A map embedded in a page therefore
moved that page. It now scrolls only the map's nearest scroll container, and
does nothing when there isn't one — a component has no business moving someone
else's page. Honours `prefers-reduced-motion`.
