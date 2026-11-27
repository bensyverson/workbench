# REPORT

## 1. Difficulty

4 of 5. The two files were quick to write and load under Node. The hard part was that the reference could not say how a Grip's radius range is stated or how a pick reaches a per-run target, so two of the task's requirements are only partly expressible.

## 2. What I built

- `dialect.js`: `ports.in.caption` (Event, seam `Event<{ value: str }>`), `ports.out.bench` and `ports.out.chart` (seam `"Draw"`, as the task gave it), and `files.glasses` (csv, `glasses.csv`, with columns name, nd, vd).
- `ui.js`:
  - `stage: { draw: "bench" }`.
  - `controls.caption`: a `text` Control bound by name to the `caption` input. Nothing else is needed for the runtime to keep the caption.
  - `controls.glass`: a `pick` over `files.glasses`, key `name`, `show` name/nd/vd, `map` x = vd, y = nd, `carry` nd and vd as f64. It has no input of its own, so it is part-local, and it has `to: "arg.bench.lens#0:0.glass"`, a fixed target for the first lens's glass. Its `value` is "BK7".
  - `grips.radius`: one Grip per lens (`each: "lenses"`), placed at `[l.cx + l.r, l.cy]` (the right edge), kind `length` with `axis: [1, 0]`, so the drag changes the radius along the horizontal axis. Its `to` is `"arg." + l.radiusTarget`, which uses the address the runtime already stores.
  - `tiles.panel`: the caption and glass Controls, split to the right of the stage.
  - `tiles.chart`: a view of the `chart` Draw output, `tabWith: "stage"`, so the bench and the chart are tabs of one group.
- The modules load: `node -e` imports both files, and the Grip lambdas return the expected values on sample input.

## 3. Where the docs misled me

- **Grip range.** Requirement 7 says a Grip's range is "the target's Grammar shape (`data("number", { min, max })`)", and the task requires the radius to stay between 5 and 80. The Grip declaration has no bound key, and the Grammar lives in the Dialect's builder, which this task does not ask me to write. So ui.js cannot state 5 to 80. I left a comment saying so.
- **Pick target versus run state.** Requirement 1 says a Control's `to` is build-time and "reads the built record, never run state." The lenses carry `glassTarget` only at run time. A pick is not a Grip, so it cannot use a lambda over state either. The only route I found is a fixed address, which works only because the task says the first lens is enough.
- **Ref ids for calls without lambdas.** The fixed address above depends on `bench.lens#0`. Requirement 8 says the build "must confirm" that a call with no lambda has a Ref id, and that this is "a build task". Until it is confirmed, the address is a guess.
- **Output seam spelling.** Every port example in the reference is an input seam (`Event<…>`). The reference never names the seam string for a Draw output. I used `"Draw"` because the task gave it.
- **Pick scatter versus chart.** The reference says `pick.map` is "two columns to scatter the rows on", which I took as the on-screen scatter in the pick form. The Abbe chart is a separate Draw output. Nothing in the reference says whether the two should match.
- **Pointer frame placeholder.** The reference's pointer seam writes `point2@<frame>`, with a placeholder frame name. I did not use the pointer, so this did not affect the files.

## 4. What I guessed

- The chart's axes: x = `vd` (Abbe number), y = `nd` (refractive index). The task says "refractive index against dispersion", and I took the usual Abbe orientation.
- The csv file's path, `glasses.csv`. The task names no path.
- The Grip's axis: the right-edge handle moves along `[1, 0]`, the horizontal axis of the bench frame.
- The caption's `max` (120) and `lines` (1). The reference's default is 256 characters, and I chose 120.
- The glass Control's initial value "BK7", which is the first lens's current glass.
- The part-local choice for the glass pick. The reference allows a Control with a `to` and no input, and I preferred that to adding a `glass` input the runtime would not use.
- The tile names `panel` and `chart`, and the title texts.
- I did not declare a pointer input, because the Grips carry the radius drag and the task does not ask for any other stage gesture.

## 5. Gaps

- **Grip range 5 to 80.** Needed: a way to state the radius bound on the Grip, or a guarantee that the Dialect's Grammar bound will be written in the builder. Smallest change: the Grammar's `data("number", { min: 5, max: 80 })` on the radius argument. That lives in the builder, which this task does not give me.
- **A pick with a per-run target.** Needed: a Control whose `to` names a target from run state (`lenses[0].glassTarget`), so that the glass choice follows whichever lens is first. Smallest change: allow `to` as a lambda over state for `pick` (as Grips do), or allow a Control's `to` to be a lambda over state.
- **Ref ids for lambda-less calls.** Needed: the reference to confirm that `bench.lens#0` exists as an address when the call has no lambda. Smallest change: state in kit/define that every call has a Ref id, or name the rule for ids of plain calls.
- **Draw output seam.** Needed: the seam string for a `ports.out` Draw output (I used `"Draw"`, as the task gave it). Smallest change: one line in the port table stating it.
- **glasses.csv path.** Needed: the path of the data file relative to the package. The task names no path.

## 6. Docs I could not reach

None. The reference does not point outside this folder, and I did not need any other document.
