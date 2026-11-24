# Composing dialects (draft)

*Draft reference, 2026-11-24. How one program uses several dialects at once. Each dialect has its own reference (`cave.md`, `tiles.md`, `glow.md`); this page covers only what happens between them.*

## Parts

A program builds **parts**. Each part comes from one dialect: `cave('depths')` is a cave part, `tiles('game')` a tiles part. Bind every part to a top-level `const`; the name you bind is the part's name in addresses and messages.

```js
import { program, params, int, num } from "kit";
import { cave } from "cave";
import { tiles, actor, tile } from "tiles";
import { glow } from "glow";
import { noise } from "./lib/noise.js";

const $ = params({ seed: int(3, 0, 99, "Seed") });
const level = cave("depths").size(24, 16) /* … */;
const game  = tiles("game").screen(192, 128) /* … */;
const light = glow("light").over(game.out.image) /* … */;

export default program("My Game").show(light);
```

`program(title)` is the whole program; `.show(part)` names the part whose image is on screen. Export it as the default. Every part you build belongs to the program, shown or not.

## Clocks

Every dialect declares its part's **clock**. You do not choose it, and there is no `.clock()` method.

| Clock | A part with it steps … | Dialect |
|---|---|---|
| `demand` | when something it reads has changed | `cave` |
| `tick(hz)` | at a fixed rate, `hz` times per second | `tiles` (`tick(60)`) |
| `frame` | once per display frame | `glow` |

Each display frame runs: input, then tick parts, then demand parts whose inputs changed, then frame parts, then the screen.

## Binding time: build and run

A program file runs in two stages.

**Build.** The program file itself runs once, as plain JavaScript, top to bottom. Builder calls (`.size(24, 16)`) record the parts. Code here is ordinary JS: `Math`, loops, helper functions, anything.

**Run.** A **runtime lambda** is an arrow function you pass to a builder slot that the reference marks *(runtime)*, such as `cave.carve(c => …)` or `glow.light(p => …)`. It is never called during the build: the kit reads its source and compiles it (to JS for a CPU part, to GLSL for a GPU part). Runtime lambdas are written in the **kernel subset** (below).

What a name means depends on the stage it is read in:

| Read … | at build time | inside a runtime lambda |
|---|---|---|
| a parameter `$.x` | a plain number; changing the parameter rebuilds the program | a uniform: it changes while running, no rebuild |
| another part's output `p.out.x` | **not allowed** (S301): it has no value yet | the producer's latest snapshot (see Time) |
| a top-level `const` holding plain data | itself | a frozen constant |
| a top-level `const` you computed from `$.x` | a number | a frozen constant: it does **not** follow the parameter; read `$.x` in the lambda for that |

### Signal-dependent arguments

Some slots take either a build-time value or a lambda: the reference writes them `n | () => n`. When the value depends on another part's output, write the lambda form:

```js
.seed(3)                                   // fixed at build
.seed(() => $.seed + game.out.depth)       // runtime: re-evaluated as game.out.depth changes
.seed($.seed + game.out.depth)             // S301: game.out.depth is read at build time
```

A slot without a lambda form (`.size(cols, rows)`) cannot depend on another part at all (S302); give it a parameter or a constant instead.

### Connecting a part to an output

Passing an output *handle* to a slot whose type is a seam type is a **connection**, not a read, and is fine at build time:

```js
game.map(level.out.cells, { rock: "wall", open: "floor" })   // connects: Grid@cell
light.over(game.out.image)                                    // connects: Image@px
```

The reference marks connecting slots with the seam type they take (`grid: Grid@cell`). Anything else you do with an output at build time (arithmetic, comparison, `if`, a loop, `.length`, a field like `.x`) is a read, and is S301.

Forward references are normal: a cave whose seed reads `game.out.depth` is built before `game` exists. That only works inside a lambda, because the lambda is not called during the build.

## Outputs: the only way between parts

A part offers values to other parts only through its **outputs**, under `part.out.<name>`. Each dialect's reference lists its outputs and their seam types. Some dialects let you declare more (`tiles` has `.export(name, type, read)`).

```js
level.out.cells     // Grid@cell, from the cave
game.out.player     // Signal<vec2@px>, exported by the tiles part
```

Reading anything else of another part (`game.player`, `level.cells`, an actor kind defined for another part, a part's builder method inside a lambda) is a reach into its internals (S312). The fix is to read or add an output. A part reading its **own** `out` is S313: read your own state directly.

## Seam types

Values that cross between parts have **seam types**, a small closed set every dialect understands:

| Seam type | Example | Notes |
|---|---|---|
| scalar | `f32`, `int`, `bool` | |
| vector | `vec2`, `vec3`, `vec2i` (integer) | may carry a frame tag |
| enum | `'rock' \| 'open'` | written as a string union |
| record | `{ id: Id, at: vec2i@cell }` | fields are seam types |
| array | `Spawn[]` | |
| `Grid<T>@frame` | `Grid<'rock' \| 'open'>@cell` | a 2D array with a shape known at build time |
| `Image@frame` | `Image@px` | pixels; only a GPU dialect reads one per pixel |
| `Event<R>` | `Event<{ depth: int }>` | a batch of records produced during one step |
| `Signal<T>` | `Signal<f32>` | any of the above as it changes over time |

Every output is a signal: its shape and type are fixed at build time; its value arrives at run time. The reference writes the type of an output plainly (`exit: vec2i@cell`) when it is a value, and `Signal<…>` when stressing that it changes each step.

GPU dialects read only scalar, vector and enum signals in their kernels; a `Grid`, array or `Event` there is S203. Export a number instead (a count, a nearest position, a timer).

### Frames

A numeric seam value may carry a **frame tag** after `@`: `vec2i@cell` is a whole-cell position; `vec2@px` is a pixel position. The tag says what the numbers measure.

- Passing a tagged value **unchanged** into a slot or field with a different tag is S251: an actor field `pos: vec2@px` given `s.at` (a `vec2i@cell`), or `distance(p.xy, level.out.exit)` with one side in px and one in cells.
- **Arithmetic erases tags.** `s.at * 8` has no tag; the checker trusts you. Prefer the named conversion: it says what you mean, and it stays right if the cell size changes.
- A conversion is named by the **consuming** dialect, the one whose frame the value is entering. `tiles` reads cave cells, so `tiles` supplies `tile(c)` (cell → px, the cell's center) and `cell(p)` (px → cell). A conversion belongs to its dialect: call it in that dialect's lambdas (S332 otherwise). If another dialect needs the value, convert it where it is converted and export the converted value.

## Time: snapshots

A reader never sees a producer halfway through a step. Inside a runtime lambda, `p.out.x` is the value the producer committed at the end of its **last completed step**: a snapshot.

- **Cycles across parts are allowed.** If the cave reads `game.out.depth` and the game reads `level.out.cells`, each reads the other's last snapshot. The loop resolves with a one-step delay: the game raises `depth` on tick *n*; the cave steps on demand after that tick; the game sees the new cave on its next tick. A cycle *inside* one part is that dialect's business.
- **Sampling.** A reader whose clock differs from the producer's can say how it samples a numeric or vector signal, with `.sample(signal, mode)`, a method every part has:
  - `"latest"` (the default): the last completed step.
  - `"lerp"`: interpolated between the last two completed steps at the reader's time. Smooth motion for a `frame` part reading a `tick(60)` part, one step behind.

```js
const light = glow("light").over(game.out.image)
  .sample(game.out.player, "lerp")
  .light(p => /* … game.out.player … */);
```

## Identity

Everything has an address, `lab:<program>#<path>`, where `<program>` is the program file's name without `.js` and `<path>` starts with a part name: `lab:program#level.out.cells`, `lab:program#game.out.lamp`. Messages, the book and the inspector use these addresses.

Things spawned from another part's output **keep that output's id**. A cave spawn point's id is `lab:program#level.spawns.bat[2]` (the third `bat` spawn); an actor the game spawns from it has that address as its `id`, so "bat 2" means the same bat in the cave, the game and the telemetry. Ids are positional within a kind for a given seed: a new seed makes a new bat 2. Never assign `id` yourself.

## Shared helpers: `lib/`

Put helpers you need in more than one part in `lib/*.js`, written as exported arrow functions in the kernel subset:

```js
// lib/noise.js
export const hash = (x, y) => fract(sin(x * 127.1 + y * 311.7) * 43758.5453);
export const noise = (x, y) => mix(hash(floor(x), floor(y)), hash(floor(x) + 1, floor(y)), smoothstep(0, 1, fract(x)));
```

Import them in the program (`import { noise } from "./lib/noise.js"`) and call them from **any** dialect's runtime lambdas: the kit compiles each helper once per target, JS for a CPU part and GLSL for a GPU part, and checks the two agree. A helper sees only its arguments, kernel intrinsics and other `lib/` helpers: no parameters, no parts, nothing else from the program file. Helpers are for kernels; build-time code uses plain JS.

## The kernel subset

Every runtime lambda and every `lib/` helper is written in the kernel subset of JavaScript:

- `const`, `let`, `if`/`else`, `for (let i = 0; i < n; i++)`, `for (const x of xs)` (CPU only), `return`, arithmetic, comparisons, `&&`, `||`, `? :`, object literals, member access, calls.
- Not allowed: `while`, `new`, `this`, template strings, `?.`, `typeof`, spread, `var`, parameter defaults, closures other than an arrow passed directly as a call argument, `function`, `class`, `switch`, `try`.
- No `Math`. These intrinsics are always in scope: `abs sign floor ceil fract mod min max clamp mix step smoothstep sqrt pow exp log sin cos tan atan length distance dot normalize vec2 vec3 vec4 PI`. Vectors support `+ - * /` componentwise and `.x .y .z`.
- Free names a lambda may use: its own parameters and locals, the intrinsics, imported `lib/` helpers, the dialect's own functions (`tile`, `cell` in `tiles` lambdas), the parameters object (`$.x`), other parts' outputs (`p.out.x`), and top-level `const`s holding plain data or actor kinds of the same tiles part. Anything else is S331.

## Seam diagnostics

Each prints as `<file>:<line>: <code> <message>`, then a `fix:` line.

| Code | When | Message shape | Fix |
|---|---|---|---|
| S201 | a `Grid` connected to a slot of a different shape | `level 'depths' is 24×16 cells; the screen holds 20×16 tiles (160×128 px at 8 px)` | change one side: `.size(20, 16)` or `.screen(192, 128)` |
| S202 | a value mapping that misses a grid value or names an unknown tile | `level.out.cells has values rock \| open; 'open' has no tile` | `{ rock: 'wall', open: 'floor' }` |
| S203 | an output of the wrong seam type for its slot or target | `.over() takes Image@px; got Signal<vec2@px> (game.out.player)` | the right output, or export a value of that type |
| S204 | a spawn kind the producing part does not declare | `level declares spawn kinds start \| bat; 'bats' is not one` | the declared kind |
| S251 | a tagged value passed unchanged where another frame is expected | `Bat.pos is vec2@px, but s.at is vec2i@cell (from level)` | the consumer's conversion: `tile(s.at)` |
| S301 | another part's output read at build time | `game.out.depth is known only at run time; it was read at build time` | the lambda form: `.seed(() => $.seed + game.out.depth)` |
| S302 | an output passed to a slot that is fixed at build | `.size() is fixed at build and cannot depend on game.out.depth` | a parameter or a constant |
| S311 | an output the part does not have | `game has no output 'lamps'; its outputs are image, player, lamp` | the right name, or `.export()` it |
| S312 | a reach into another part's internals | `light reads game.player, which is inside part 'game'` | `game.out.<name>`, adding `.export('player', 'vec2@px', w => w.player.pos)` |
| S313 | a part reading its own output | `game reads game.out.lamp, its own output (one step stale)` | read your state directly: `w.state.lamp` |
| S321 | a bad `.sample()` | `"lerp" needs a numeric or vector signal; game.out.state is an enum` | `"latest"` |
| S331 | a free name a lambda cannot see | `Math is not in the kernel subset` | `sin(x)`, not `Math.sin(x)` |
| S332 | a dialect's function used in another dialect's lambda | `tile() belongs to tiles; light is a glow part` | convert in `tiles` and export the result |
