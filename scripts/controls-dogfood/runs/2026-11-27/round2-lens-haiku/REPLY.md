Difficulty: **4 of 5**. The two files were quick to write, but the reference can't express two of the task's requirements, so the controls are only partly right.

All three files are written in `/private/tmp/822dDs-lens-r2`: `dialect.js`, `ui.js` and `REPORT.md`. Both modules import under Node 26 and the Grip lambdas return the expected values on sample input.

**Hardest part:** The radius must stay between 5 and 80, but a Grip has no bound key. The reference says the range comes from the target's Grammar shape, and that lives in the builder, which this task doesn't ask me to write. So `ui.js` can't state 5 to 80, and I left a comment saying so. The glass pick was harder still. Its `to` is build-time, but the lens's glass address exists only in run state. The only option I found was a fixed target, `arg.bench.lens#0:0.glass`. That works because the task says the first lens is enough, but it depends on Ref ids for calls with no lambdas, which the reference says is still unconfirmed. The full list is in `REPORT.md`, under Gaps and Where the docs misled me.

(Saved by the integrator from the transcript's final message.)
