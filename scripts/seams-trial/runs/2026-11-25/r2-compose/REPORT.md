# REPORT: composer leg

## 1. Difficulty

3 of 5. The wiring itself was easy: the two ports and the field name `at` match, and one `fit` frame relation is enough. What made it harder was that `seams.md` says nothing about when a burst plays relative to a pickup, and I could not settle the rate semantics for a triggered emitter from the draft alone.

## 2. What you did

- **Part `maze("level")`**: my own 10-column by 8-row grid with six coins, start at `{ x: 2, y: 1 }`, tick `1/8`, and a `steer` control that walks with the D-pad and stands still on B. Ten by eight cells was chosen so that the `fit` edge is an even 32 px per cell in a 320 × 256 box.
- **Part `particles("fx")`**: bounds 320 × 256, `maxParticles(400)`, `seed(3)` for repeatable sparks, tick `1/30`, two forces (`gravity`, `drag`), an `update` that kills particles past their life, and one emitter `spark` with `trigger: "burst"`, `rate` 60 and a `spawn` that scatters each spark within `inp.radius` of the burst point. A stranger would want the `burst` input because it spawns particles where a player picks something up, without knowing what the pickup is.
- **Frame relation** `.frame(level.frame.cell, fx.frame.px, "fit")`: maze cells (origin at the centre of the top-left cell, y down) into particle pixels (origin at the box's top-left corner, y down). Both frames declare `extent`. The checker reported the edge as `×32 +16`, which is what I expected for a 10 × 8 cell box in a 320 × 256 box.
- **Wire** `.wire(level.out.picked, fx.in.burst)`: the maze's `Event<{ at: point2@cell }>` into the particles' `Event<{ at: point2@px }>`.
- **Show** `.show(fx)`: the particles' stage.
- I did not wire `radius`, so it uses its default of 40 px.
- I did not change `maze/` or `particles/`.

## 3. Where the draft misled you

- `packaging.md`, "What a package does not have (yet)": "**No ports or seams.** How a package declares what it offers to a glue Program is still being designed." `seams.md` ("Ports, for a language's author") defines exactly that, with `ports:` in `defineDialect`, and both packages declare ports. A reader of `packaging.md` would think the ports are not part of the package format yet.
- `seams.md`, the glue example: `import { maze } from "maze";` with the comment "each package's Grammar, by the package's name". `packaging.md` says a package may import only `kit/define` and its own files, and that bare names are not allowed. The draft does not say how a bare name such as `"maze"` resolves in a glue program, or which export it names. I took it as I wrote it above.
- `seams.md`, "Event outputs": "An `Event` output is a state list your host refills each step … and empties at the start of the next." Read with `maze/maze.dialect.js`, this means that a pickup is visible on the wire only until the next maze step. `seams.md` does not say whether the kit delivers every step's records to a wire, so the draft seemed to promise a delivery it does not state.

## 4. What you guessed

- **Package import names.** `import { maze } from "maze"` and `import { particles } from "particles"` resolve to each package's Grammar export of the same name. The examples in `maze/examples/` and `particles/examples/` use that export.
- **`control(steer)` and the pad.** `compose` has no call for wiring the D-pad. I assumed the page supplies the `Pad` object to the maze's control from the maze UI, and wrote `steer` as `(pl, pad) => …`.
- **Burst count.** I read "its rate lambda still gives the count for that tick" as: on each tick that carries a burst record, the emitter spawns the number its `rate` returns (60) once. I did not read it as a continuous fountain.
- **Start cell.** I assumed `start` must be a floor cell. `(2, 1)` is a floor cell in my grid.
- **Ticks.** I chose maze tick `1/8` and particle tick `1/30`. The draft does not say how the two clocks relate, so I did not try to align them.
- **Emitter position.** I set the emitter's `x`/`y` to the box centre (160, 128). The draft says triggered particles are placed at the record's position, so `x`/`y` are unused, but the checker still requires them inside the box.
- **Show.** I showed only the particles' stage. The maze's own UI (its score tiles) does not come along in the composition, and `compose` does not say whether it could.

## 5. Gaps

Smallest first.

1. **Relative timing of a burst and a pickup.** `seams.md` gives no order between a maze step and a particle tick, nor a shared clock, nor a bound on latency. I needed to know whether a burst plays on the next particle tick after the pickup, or at some later point. The answer to question 3 depends on it.
2. **Delivery of events.** The draft does not say whether the kit passes on every step's `Event` records, or only the latest. A maze step that refills `picked` before the particle side has read the previous step's records might lose them. I needed a stated guarantee (queue or latest-value).
3. **Per-burst rate.** The draft does not say whether `rate` is read once per record or once per tick. I needed this to know how many sparks a pickup makes.
4. **Composed UI and pad.** `compose` has `.show` but no way to bring a part's UI inputs (the D-pad), tiles or readouts into the composed page.
5. **Name resolution.** The draft does not say how `import … from "maze"` is resolved in a glue program. `packaging.md` forbids bare names in package modules, and a glue program is not a package.
6. **Burst size from the event.** A burst record carries only `at`. I could not make the spark count depend on the coin, or on anything but the position, without changing the maze's record.
7. **Clock relation.** No way to state that the two parts run on one clock, or at what rate each part's host steps.

## 6. Answers

1. **The seam.** I wired the maze's `out.picked` to the particles' `in.burst`. The two frames, `maze.cell` and `particles.px`, are related with `"fit"`, which gives 32 px per cell and centres the 10 × 8 maze in the 320 × 256 box. The check passed on the first run with no violations. I did not deliberately break the wiring to see what it catches, so I cannot say which mistakes it would catch.
2. **What did not fit.** The ports met as written. The field name `at` matches on both sides. The point types match, since the maze's `cell2` is `vector(2, "f64")` and the particles' `px` pairs with a point of that shape. The frames differ in origin (the maze's cell centre against the box's corner), and `fit` handled that without a hand-written conversion. Nothing else stood between them. What I would have needed is a way to vary the burst by the coin (see Gaps 6), and a statement of the timing contract (Gaps 1 and 2).
3. **Time.** From `seams.md` I can tell that a pickup is in the maze's `picked` list during one maze step, and that the particles' host takes burst records before each of its ticks. I cannot tell whether a burst plays on the next particle tick, or at some later point, because the draft does not state the order between the two hosts' steps, a shared clock, or a latency bound. I would want: the host order (or a single clock), a latency bound in seconds for the burst after the pickup, and a guarantee that every pickup yields a burst.

## 7. Files

Opened and read, in full:

- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `examples/07.js`, `refusals/r01.js` to `refusals/r06.js`

Written: `workbench.js` and `REPORT.md`, in this folder.

Ran: `check.sh`, once. Result: "no violations", with the one wire line shown above.

Listed but not opened: the folder listing showed `transcript.jsonl` and `stderr.txt` in this folder. I did not open either. I did not open `check.sh` or `hash.sh` either; I only ran `check.sh`. Nothing else was opened.
