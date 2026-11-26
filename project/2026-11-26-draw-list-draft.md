# Draft: the composed page, with draw lists on the wire

*2026-11-26, leaf `FqsPVJ` (M4 Composition, `SPPLaM`). A design draft for Ben, not built and not ruled. Ben's two rulings shape it. First, a workbench that combines stages adds a **root part** in its own Dialect, which takes the other parts' outputs and draws what it likes ([the seams draft](2026-11-25-seams-draft.md), rulings block). Second, what crosses the wire is **a draw list**: "essentially draw calls, which can then be lowered to GLSL, SDL, Canvas, or even Game Boy" (Ben, 2026-11-26). Inputs: the relay trial's finding 7 ([findings](2026-11-25-seams-relay-trial-findings.md)); the UI's stage contract (`kit/define/README.md`, `defineUI`); the seams and clocks drafts as ruled.*

## The problem in one paragraph

Today a stage is a trusted custom element. It gets the run's state and draws however it likes, and no other part can see what it drew. So the relay's composers could not say "the burst drawn over the maze". The maze's picture was locked inside the maze's element. Ben's rulings move the picture onto the wire as data. Each part can **offer** its drawing as an output. A root part takes those drawings as inputs, combines them in whatever order and arrangement its author chooses, and is the one shown. A **renderer**, per target, turns the shown draw list into pixels.

## The shape in one example

```js
// maze.dialect.js: maze offers its picture, in its own frame
ports: { out: {
  view: { seam: "Draw<256>@cell", from: (s) => drawMaze(s), note: "walls, coins and the player, one cell per unit" },
} }

// particles.dialect.js: particles offers its own
ports: { out: {
  view: { seam: "Draw<512>@px", from: (s) => drawParticles(s), note: "each live particle as a disc" },
} }

// arcade.dialect.js: the root's Dialect takes two pictures and makes one
ports: {
  in:  { board: { seam: "Draw<256>@screen" }, fx: { seam: "Draw<512>@screen" } },
  out: { view: { seam: "Draw<800>@screen", from: (s, inp) => [...inp.board, ...inp.fx, ...hud(s)] } },
}

// workbench.js: the glue
compose("coin-bursts")
  .part(level).part(fx).part(cab)
  .frame(level.frame.cell, cab.frame.screen, "fit")
  .frame(fx.frame.px, cab.frame.screen, { scale: 1, offset: 0 })
  .wire(level.out.view, cab.in.board)
  .wire(fx.out.view, cab.in.fx)
  .show(cab);
```

*(Spread and per-item helpers are written here as an author would want to write them. Question 1 says what the subset needs for this to lower.)* The kit converts each draw list into the root's frame on the wire, as it converts any point. The root's own lambda decides the layering: board first, then the burst, then a HUD. Nothing in the kit knows the word "layer".

## The draw list

`Draw<max>@<frame>` is a new seam type: a list of at most `max` **draw ops**, in painter's order, measured in one frame. Like `list<T, max>`, its max is part of the type, so every list has a known worst case before anything runs.

A draw op is a record from a small, closed set:

| Op | Fields | Converts |
|---|---|---|
| `rect` | `at: point2`, `size: vec2`, `fill`, `stroke?` | `at` by scale and offset, `size` by scale |
| `disc` | `at: point2`, `r: f64` (a quantity), `fill` | `r` by the uniform scale |
| `line` | `from: point2`, `to: point2`, `width: f64`, `stroke` | both points; `width` by the scale |
| `sprite` | `at: point2`, `sheet`, `tile: i32`, `flip?` | `at` only; a sprite's size is its sheet's |
| `tiles` | `at: point2`, `sheet`, `grid: list<list<i32>>` | `at` only |
| `text` | `at: point2`, `str`, `font`, `fill` | `at` only |

- **Colors are palette indices, not RGB.** A Dialect declares a palette (named colors), and a renderer maps each index to what its target can show. Canvas maps it to RGBA. A Game Boy renderer maps it to one of 4 shades, and refuses a palette with more than 4 entries rather than guessing.
- **Sheets are declared assets** (a tile size and an image), named in the Dialect like frames. That way `sprite` and `tiles` work on targets with no free-form drawing.
- The set stays closed and small on purpose. Every op must be something each renderer either draws exactly or refuses up front.

## Where a draw list comes from

A draw list is **an output port with a `Draw` seam**, and its `from` is a value lambda over the state. The seams build already lowers and type-checks output lambdas. So a picture is checked like any other output: typed, inside the subset, analyzable, and lowered to whatever target runs the part.

That last point is what makes "even Game Boy" real. If a part's drawing were trusted JS (today's custom element), it could only run where JS runs. As a lowered lambda, it goes wherever the kit can emit to.

The custom-element stage stays, as the trusted escape hatch for a part that draws what the op set can't (a chart library, say). Such a part offers no `Draw` output, so a root cannot compose its picture. The page says so instead of failing quietly.

## Renderers: one per target, owned by the kit

A **renderer** turns the shown part's draw list into pixels on one target. Each renderer declares a **profile**: the ops it draws, its palette size, and its hard limits.

| Renderer | How directly it lowers | Limits it declares |
|---|---|---|
| Canvas 2D | nearly one call per op | none that matter |
| SDL | nearly one call per op | none that matter |
| GLSL / WebGL | ops batched into instance buffers by kind, one draw call per kind; `disc` as a quad with a distance test | instance-buffer size |
| Game Boy (DMG) | `tiles` to the background map, `sprite` to sprite slots; `rect`, `disc`, `line` and free text are refused | 4 shades; 40 sprites, 10 per scanline; 8×8 tiles; a 20×18 tile screen |

**Checking a list against a profile happens at composition wherever the types allow, and at run time only where they can't.** This follows the queue ruling: a `Draw<512>` into a renderer limited to 40 sprites is a compose-time error naming both sides, unless the op mix is narrower (a list typed to `sprite` only, at most 40). A per-scanline limit depends on positions, so it is checked when the list is drawn, and reported with an R code: the part, the instant, the scanline. A renderer never silently drops ops.

## Input through the stage

A click or touch on the stage lands in the shown part's frame. The root owns the page's controls (the seams draft's ruling), so it decides what a click means and wires that to whichever part should hear it. The kit can map a point back through any frame path, because edges are invertible, so the root can ask which board cell was clicked without knowing the maze.

## What changes elsewhere

- **The seams build (`wwG0JR`):** none yet. `Draw` is the first seam type past v0's closed set, the kind of extension the seams draft names ("each when a dialect needs it"). It lands after the seams build, as its own leaf.
- **defineUI:** `stage` gains a third form beside a custom element and the text view: "render my `Draw` output named `view`". The page picks the renderer for its target.
- **Parts that aren't shown** keep running. Their tiles and readouts still show, and their inputs are driven by wires from the root, never by the page directly.

## Parked

- **Transforms inside a list** (rotate, a group with its own frame). The frame relation covers placement, and no pair of ours needs rotation (the seams draft parked it too).
- **3-D.** `Draw3` would follow the same pattern when a 3-D Dialect exists.
- **Text layout beyond one line.** A `text` op is one run of characters, and a renderer may refuse fonts it lacks.
- **Partial redraw and dirty regions.** A renderer may diff lists internally. The contract is a whole list per step.

## Questions for Ben

1. **A picture is an output port with a `Draw` seam, built by a lowered value lambda**, not trusted JS. Recommended: it can be type-checked and moved to other targets, and it reuses the seams build. **Checked 2026-11-26, the subset can't build one yet.** One op per particle is a list as long as the state's list. Today's subset has `filter`, `find`, `some`, `every` and `reduce` as queries, but no `map` (kit/lower/README.md, "Queries"). Spread is refused (S109). An array literal has a fixed length. The example above, written with `...`, does not lower today. Two ways to close the gap:
   - **(a) Add `map` as a query, plus concatenation.** `s.particles.map((p) => disc(p.at, 2, FX))` lowers to an `each` loop, and its max is the source list's max. Spread inside an array literal (or a `concat`) adds maxes. Every bound stays static, so the renderer-profile check works at composition. Recommended.
   - **(b) Hand the lambda a draw handle** (`d.disc(…)` inside a `for…of`), the way `step` pushes Events. It fits today's subset, but the list's length is known only at run time, so profile checks move to run time.
2. **A closed op set with palette-indexed color and declared sheets**, designed against the Game Boy's limits from the start. Recommended. The alternative, free RGBA and arbitrary paths, makes Canvas easy and every constrained target a pile of approximations.
3. **Renderer profiles, checked at composition where the types allow**, never dropping ops silently. Recommended: the same rule as the queues.
4. **The custom-element stage stays** as an escape hatch whose picture can't be composed. Recommended.

## Next

Dogfood before building: a small trial on paper, from this draft alone. One fresh agent gives maze a `view` output, one gives particles one, and a third writes the root Dialect and glue that layer them, with a HUD. A checker types the lists and runs them through a Canvas renderer and a Game Boy profile. If question 1 goes to (a), `map` and concatenation are a kit/lower leaf ahead of the trial's build, and the trial tests whether agents write them naturally. Then build `Draw` as a leaf after `wwG0JR`.
