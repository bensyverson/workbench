# kit/draw: draw lists

A part's picture as data on the wire ([the draw-list draft](../../project/2026-11-26-draw-list-draft.md), as ruled 2026-11-26, leaf `pSo5YA`). A Dialect offers its picture as an output with a `Draw<max>@<frame>` seam ([kit/seam](../seam/README.md)); another part takes it as an input, layers it with others, and is the part the page shows. This module holds what every other module shares about a draw list: the closed op table, a Dialect's paint (named colors, declared images), the builders that make a list from a run's state, an op's conversion across a wire, the renderer profiles and the Canvas 2D renderer. [kit/define](../define/README.md) reads Draw ports, [kit/compose](../compose/README.md) checks Draw wires and the shown list's kinds, and [kit/run](../run/README.md) builds the lists and carries them. No Node built-ins.

## API

| Export | Does |
|---|---|
| `OPS`, `OP_KINDS`, `FONTS`, `GLYPH` | the op table (each op's fields, `[type, required]`), its six kinds in order, the one font (`"mono"`), a character's size (8 units) |
| `typeOp(op, paint)` | the problems with one op, each a sentence; `[]` when it fits the table and names only the paint's colors and images |
| `checkPaint({ colors, images })` | the problems with a Dialect's `colors` and `images` |
| `resolveColor(c, colors)` | a color name or literal as `"#rrggbbaa"`, or null |
| `convertOp(op, edge, images)` | one op converted across a frame edge (below) |
| `opBox(op, images)`, `nativeSize(op, images)`, `cellCount(image)`, `gridCells(op)` | the box an op covers; the size an image or tiles cell draws at without `size`; an image's cells; a tiles grid as cell numbers |
| `declareDraw(port, { listMax, inputsName })` | a Draw output's declaration read into layers, each with its source (`{ decl, problems }`; J001, and the Runtime Subset's own S codes) |
| `kindsOf(layers, inputsName)` | the op kinds a builder can hold, the Draw inputs it spreads, and whether any are hidden (`{ ops, inputs, open }`) |
| `drawMax(decl, ceiling, record, lowered?)` | one built Program's max for an output (ruling 1), counting each whole layer's static max from its lowering (`lowered`), or why it has none (J010) |
| `runDraw(decl, { state, record, max, paint, part, fns })` | the list built on one state by `fns`, one function per layer (in a run, the emitted Kernels): `{ ok, list }`, or the J020–J022 that stops the part |
| `drawTypes(num?)`, `PEN_OBJECT`, `PEN_EFFECT`, `OPEN` | the op table as core IR types, for lowering a builder: `{ op, list(max), pen }` (types.js) |
| `carryList(list)`, `isCarried(op)` | marks ops that left their builder or crossed a wire, so a builder that spreads them does not type them again |
| `CANVAS`, `GAMEBOY`, `PROFILES` | the renderer profiles (`{ name, label, kinds, limits? }`) |
| `kindProblems(profile, kinds)` | the kinds a profile does not draw: what kit/compose's S401 reports |
| `checkDraw(profile, list, { images, box })` | the draw-time check (`box` null for a frame with no extent): `{ ok, diagnostics, summary }` (J040–J042) |
| `shadeOf(hex)` | a color's Game Boy shade, 0 (lightest) to 3, or null for alpha 0 |
| `drawCanvas(ctx, list, { images, sources? })` | draws a list on a Canvas 2D context, in painter's order |
| `DRAW_CODES`, `DRAW_PORT_KEYS` | |

## The op table

| `op` | Fields (`?` optional) | Across a wire |
|---|---|---|
| `rect` | `at: point2`, `size: vec2`, `fill?`, `stroke?` | `at` by scale and offset, `size` by scale |
| `ellipse` | `at: point2` (center), `r: vec2`, `fill?`, `stroke?` | `at`; `r` by the scale's magnitude |
| `line` | `points` (two or more), `width`, `stroke`, `closed?`, `fill?` | every point; `width` by the mean magnitude |
| `image` | `at` (top-left), `image`, `cell?`, `size?`, `flip?: 'x' \| 'y' \| 'xy'` | `at`; `size` by the scale; an unsized image gets its declared size scaled |
| `tiles` | `at` (top-left), `image`, `grid`, `key?`, `size?` (one cell's), `wrap?: [cols, rows]`, `wrapAt?` (the ring's origin) | `at` and `wrapAt` as points; the cell size by the scale (ruling 3) |
| `text` | `at` (top-left), `str`, `font`, `fill` | `at` only: a wire that flips an axis moves the string's top-left, not its box, so the text lands one glyph height (8 units, scaled) off where a mirrored box would be; place text after the flip, or in a frame that does not flip |

- **A tiles `grid`** is a list of rows, each a list of cell numbers (`-1` draws nothing) or a string read through `key`, `{ "<char>": <cell> }` (ruling 5: the grid a maze keeps in its state feeds a tiles op as it is). A character the key does not map is J020. `wrap` makes the grid a ring that repeats from the frame's origin, so a scrolled map is a tiles op whose `at` is minus the scroll. `wrapAt` is the ring's origin when it is not the frame's: a builder leaves it out, and a wire sets it (an op crossing an offset keeps its ring with its frame). A cell that straddles the ring's far edge is drawn at both ends, so a scrolled ring has no gap.
- **Colors** are `"#rrggbb"` or `"#rrggbbaa"`, or a name the Dialect's `colors` declares; an op leaves its part with every color as `"#rrggbbaa"`, so a stranger's list never needs the names.
- **Images** are declared `{ size, cell?, note }`, with no pixel data; an op leaves its part with its image named `<part>.<image>`. A host that has a picture passes it to `drawCanvas` in `sources` by that name; without one, Canvas draws the image's box.

## Building a draw list

A Draw output takes one builder: `from` (a whole list), `each` with `from` (one op or null per item of a state list), `pen` (one call per op), or `layers` of those, concatenated in order. **A builder is Bench code** (ruling 1; leaf `vcIzt1`): kit/define lowers each layer through kit/lower for each built Program ([`../define/draw-lower.js`](../define/draw-lower.js)), and kit/run runs the emitted Kernels. It reads its parameters, the inputs global (value inputs, and each Draw input as a list of ops, ruling 4), `$`, the Dialect's intrinsics and its `library`, and a page global (kit/define's [`PAGE_GLOBALS`](../define/page-globals.js), today only `Math`, which the page supplies); those are the globals a run gives it, so any other global of the Dialect is L001 at lowering, its message saying a builder does not get it (until leaf `9t99go` it lowered and then failed as J022), and a top-level const or helper of the Dialect's own file is not a name it can see either (L001). Its parameters are typed: `s` the Dialect's state, `record` the built record's value (a number the Dialect's number type, an array a list as long as it is, an object a struct; null and empty arrays are left out), `<item>` the state list's item, `pen` a handle whose six methods each take that op's fields. Its result is typed from the op table ([`types.js`](types.js)): a whole builder an op, a list of at most the seam's ceiling, or null; an each builder an op or null. So an op off the table (a missing `r`, a field of the wrong type, an unknown `op`) is lowering's L003 at the field, and a builder outside the Runtime Subset is refused at defineDialect with the subset's own S code. Colors and images are strings to lowering, checked when the list is built (J020), and so is a tiles `key`, which no IR type holds (its field type is `unknown`, the IR's mark for "already judged"):

| Builder | Called as |
|---|---|
| `from` | `(s, record)`: returns an op, a list of ops (a `null` in it draws nothing) or null; may concatenate with spread, `[...<inputs>.<port>, <op>]` |
| `each: "<path>"`, `from` | `(item, s, record)` for each item of the state list at `<path>`, which needs a max; returns one op or null |
| `pen` | `(s, pen, record)`: each `pen.<op>({ <fields> })` adds one op; returns nothing |
| `layers: [ … ]` | each layer one of the above; a pen layer states `max` |

**Its max** for one built Program (ruling 1): the port's `max` (a whole number or `(record) => <n>`), else the sum of its layers' maxes when each is known (an each layer's state list max, a pen layer's `max`, a whole layer's static max: the largest list its returns can give, a concatenation's being its parts' maxes summed, a Draw input's its seam's max), else the seam's ceiling. A max past the ceiling is J010, reported when the Program lowers; a whole builder whose concatenation can pass the ceiling is lowering's L003. J021 at run time is left only where the max comes from the record (a port's or a pen layer's `max(record)`) or from a pen's count, which only the run knows.

**Its kinds** (ruling 2) are read from the source: an op literal's `op` string, a pen's method calls, and each `...<inputs>.<port>` spread, which kit/compose follows along the wire to that input's producer. Anything else that could make an op (a computed tag, a helper's result, a pen handed to a helper) leaves the kinds open, and then only the draw-time check judges them.

## Invariants

- **Builders are Bench code.** Each layer is lowered through kit/lower and run as its emitted Kernel, never as the function the Dialect holds; its globals are bound as every Kernel's are (kit/run's compile.js), and nothing is set on the global object. The kinds scan still reads the source.
- **A list is never truncated.** A list longer than its max, or a layer past the max it states (a pen's, or a `from` layer's `max`), is J021; a layer max that is not a whole number of at least 0 for this Program (`max: () => undefined`, a negative one) is J010, whether or not the port states a max, never a silent ceiling or an empty pen (review F6); an op off the table is J020; a throw is J022. Each stops the part (kit/run), as N002 does.
- **Painter's order.** Later ops cover earlier ones; layers concatenate first layer first. Nothing in the kit knows the word "layer".
- **A renderer never drops an op silently.** At composition a profile judges kinds only; at draw time `checkDraw` counts exactly and names the profile and the limit. The composer owns the budget.

## What the draft left to the build (ruling 6)

- **A `from` layer's count** toward the max: as many ops as it returns (a single op counts 1, null 0); its declared max is unknown unless the layer states `max`.
- **A negative `size`** spans backwards from `at`: a rect covers `at` to `at + size`, and an image or tiles cell drawn with a negative size is mirrored on that axis (as a flipping edge makes it). A radius is a magnitude, so `r` stays positive. A renderer that cannot mirror refuses (J041): the Game Boy mirrors an image with its sprite's flip bit and refuses a mirrored tiles op.
- **Alpha on a 4-shade renderer:** alpha 0 draws nothing; any other alpha draws the color's shade, by brightness. The Game Boy has no blending.
- **Text formatting:** `str` is a string; a builder formats a number itself (`"SCORE " + <n>`, a helper that pads). `text` is one line of `"mono"`, 8 by 8 units a character. Canvas draws a character 8 units wide by measuring the face's own width at 8 px and stretching the string to fit (an em box 8 tall; a context that cannot measure draws the face as it is). A line's `fill` needs `closed: true` (J020 otherwise): an open line has no inside.
- **A Draw input and a `demand` part:** a Draw input is a value input, so a changed list wakes a `demand` part as a changed value does, and the runtime sees it in `ctx.inputs` too.
- **Which output the page shows:** the shown part's only Draw output, or the one named `view`; several with none named `view` is S402.

## Profiles

| Profile | Draws | Draw-time checks |
|---|---|---|
| `CANVAS` | every op | none |
| `GAMEBOY` | `image` cells as sprites (a negative size is the flip bit), `tiles` as the background and window, `text` as sprites | J042 another kind; J041 an image whose cells are not 8 by 8 multiples, an image drawn at another size than its own (a scaling wire or a `size`; a mirror is fine), tiles with a size or a mirror, a second tiles layer that is not exactly the window; J040 more than 40 sprites (a 16-by-16 cell is 4; each non-space text character is 1), more than 10 on a pixel row, more than 2 tiles layers, more than 256 distinct background tiles, a stage past 160 by 144; J043 a tiles op listed after a sprite or text it overlaps; J044 overlapping sprites listed against the hardware's x priority |

**Game Boy text** is always charged as sprites, one 8-by-8 sprite per character that is not a space, against the 40 total and the 10 a row; the window layer is not used for text (modeling it was more than a small change). A **second tiles layer** is the window, and is refused (J041) unless the hardware can draw it exactly: every cell a tile (no `-1`, no ragged row), at a multiple of 8 from the stage's corner, and reaching the stage's right and bottom edges. A first layer is the background. A frame with no extent (`box` null) is judged against the screen.

**Game Boy painter's order.** A list means later covers earlier, but the DMG draws every sprite (and text) above the background and window, and among overlapping sprites the one with the **smaller x** on top, a tie going to the earlier OAM entry (the earlier op in the list). The profile checks both, per 8-by-8 object (a wide image's cells are objects with their own x; text is one object per non-space character), counting only overlap that is on the stage:

- **J043**: a `tiles` op listed after a sprite or text op it overlaps (any drawn cell, so a `-1` cell does not count). List the tiles first.
- **J044**: a sprite listed after one it overlaps, unless its x is strictly smaller than the earlier object's. A tie is refused too: painter's order shows the later one, the hardware the earlier. One diagnostic per pair of ops.
- Overlap is of the 8-by-8 boxes, not of visible pixels: a sprite's transparent pixels are not known to the profile, so a list that happens to draw the same pixels is still refused. The sprite's BG-priority bit is not modeled (the op set cannot express it): sprites are always above.
- Not checked: tiles over tiles (the window over the background is the hardware's own order), and a sprite hidden by the 10-a-row limit (J040 already refuses).

**Assumed 8-by-8 sprite mode.** The DMG's 8x16 object mode is one global switch (LCDC bit 2), not a per-sprite choice, so the profile models the default 8x8 mode: a 16-tall image is two objects, and the counts and the x-priority above use that. Modeling 8x16 would be a profile option that halves object counts for tall images and refuses any 8-tall one; nothing needs it yet, so it is left out.

**VRAM.** The background and window share one tile map of at most 256 distinct tiles; more distinct (sheet, number) tiles in `tiles` grids is J040. The 384-tile total cannot be exceeded from what the profile sees (256 background tiles plus at most 40 sprite tiles), so it is not checked. Text's font tiles, which a sprite text op would also need, are not counted: the profile does not know the font.

## Codes

| Code | When |
|---|---|
| J001 | a malformed Draw port: no builder or several, a layer with a key it does not take, an each path that is not a state list with a max, a pen layer without its max, a bad max, a Draw input given a default, required, delivery, record or type, a frame that is not 2-D |
| J002 | retired (leaf `vcIzt1`): a builder that called map and its kin. Builders are lowered now, so `map` is lowering's own L002 or L005; the number is not reused |
| J003 | a malformed `colors` or `images` declaration |
| J010 | a Program's max, or a layer's, that is not a whole number of at least 0, or a max past the seam's ceiling |
| J020 | a builder made something off the op table |
| J021 | a list over its max, or a layer over the max it states (a pen's, a `from` layer's) |
| J022 | a builder threw |
| J040 | a profile's limit passed at draw time |
| J041 | an op a profile cannot draw exactly |
| J042 | an op kind a profile does not draw, found at draw time |
| J043 | a tiles op listed after a sprite it overlaps, which the Game Boy would draw beneath it |
| J044 | overlapping sprites listed in an order other than the Game Boy's x priority |

J is reserved for the kit (kit/define's `RESERVED_LETTERS`), so a Dialect's own codes cannot take it.

## Not built yet

GLSL lowering of draw lists (parked in the draft; a builder's Kernel holds lists, which kit/lir refuses); partial redraw; `defineUI`'s third stage form ("render my Draw output"); a Game Boy renderer that makes pixels (the profile checks only).
