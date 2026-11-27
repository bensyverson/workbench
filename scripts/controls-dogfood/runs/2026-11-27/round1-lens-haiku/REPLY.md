Difficulty: 3 of 5.

All three files are written in `/private/tmp/822dDs-lens`: `dialect.js`, `ui.js` and `REPORT.md`. Both modules import cleanly under Node v26.13.1. I have not run them against a kit, since none is in the folder.

The hardest part was that three of the bindings depend on readings `reference.md` does not settle. The radius grip uses `each: "lenses"`, but U018 requires a list with a max, and the task gives none. The 5..80 clamp has no place on a Grip, since a Grip has no `min` or `max` key. The glass pick's `to` is a static address, because the reference gives no form for a top-level Control `to` that reads runtime state. I wrote each of these as the nearest thing the reference can say, and listed each under Gaps in `REPORT.md`, with the smallest change that would settle it. Two smaller guesses are also flagged there: the `files` entry shape and whether `radiusTarget` already includes `arg.`.

(Saved by the integrator from the transcript's final message.)
