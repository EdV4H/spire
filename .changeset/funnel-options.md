---
"@edv4h/spire-gen": minor
---

feat(gen): cap how many nodes a map starts and finishes on

`minStarts` was a floor with no ceiling, so a spec could ask for few entry
points and still get many, and the terminal row had no control at all. Adds
`maxStarts` and `maxEnds`; setting `minStarts`/`maxStarts` to 1 and `maxEnds` to
1 gives one beginning and one summit.

`maxEnds` narrows the columns a walk may occupy as it approaches the terminal
row. Because every walk shares that one interval their left-to-right order is
preserved, so funnelling can never introduce a crossing.

A spec that sets neither option produces exactly the map it did before, from the
same seed.
