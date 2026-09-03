---
"@edv4h/spire-gen": minor
---

feat(gen)!: default to one start and one finish

A spec that says nothing about entry and terminal nodes now produces a map with
a single beginning and a single summit. Branching to several finishes is the
unusual case and should be the one that has to ask.

`maxStarts` omitted now pins the count to `minStarts` rather than leaving it
uncapped — a floor without a ceiling almost always means "this many", and a spec
setting only `minStarts` quietly getting more was a surprise. Pass `null` to
either option for no cap.

Breaking: a spec relying on the previous defaults produces a different map.
