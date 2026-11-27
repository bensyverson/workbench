Difficulty: **4 of 5**.

All three files are written in `/private/tmp/822dDs-synth`: `dialect.js`, `ui.js` and `REPORT.md`. Both modules import under Node. The hardest part was the tile and the envelope. `reference.md` does not say how a tile's body is written or how a tile sits under the stage, so I wrote the tile as a plain list of components and flagged it as invented. The envelope is a point list whose `to` targets an array literal in the source, and the write-back table has no row for an array literal, so the envelope's live edits would be refused as written. The volume knob also conflicts with the docs: a log curve is refused when the minimum is at or below 0, and volume runs from 0 to 1. I used the annotate route for it and listed the conflict under Gaps.

(Saved by the integrator from the transcript's final message.)
