# Draw lists: a part's picture on the wire

*Today a part's stage is drawn by its own code, and no other part can see it. This page adds a way for a package to **offer its picture as an output**: a **draw list**, a short list of drawing operations in one of its frames. Another part can take that list as an input, layer it with others, and be the part the page shows. A **renderer**, one per target (a Canvas, a GPU, a Game Boy), turns the shown list into pixels. This page adds to `seams.md`: where `seams.md` says there is no way "to draw one part's stage over another's, or to pass … images", this page is the exception, and so it is to `api.md`'s "a composed page that layers parts", if you have that page.*

**Reading the snippets.** A word in angle brackets is a name or number you choose, with the rule for choosing it beside it: `<port>`, `<frame>`, `<path>`, `<color>`, `<image>`, `<max>`. A digit tells two of a kind apart, and `<…>` stands for text or code you write. Everything outside angle brackets is literal: keys such as `seam`, `from`, `each`, `pen`, `layers`, `colors`, `images`, the op names and their fields, the seam spelling `Draw<…>@…`, and all punctuation. Don't type the angle brackets, and take names and numbers from your task, not from a snippet.

## The seam type

| Seam type | Written | Means |
|---|---|---|
| draw list | `Draw<<max>>@<frame>` | at most `<max>` draw ops, in painter's order (later ops cover earlier ones), every position measured in `<frame>`. `<max>`: a whole number, the most ops one list can hold |

- `<frame>` is one of your own 2-D frames (`dims: 2`). A draw list is a **signal**: a fresh list after each of your steps.
- Like `list<T, max>`, the max is part of the type. Every list has a known worst case before anything runs, and a list that holds more ops than its max at run time is an error, never truncated.
- A `Draw` port needs a `note` (what is drawn, in which frame), like any port.

## Draw ops

A draw op is a record from this closed set. Its `op` field names which.

| `op` | Fields (`?` optional) | On a wire, converts |
|---|---|---|
| `"rect"` | `at: point2`, `size: vec2`, `fill?: color`, `stroke?: color` | `at` by scale and offset, `size` by scale |
| `"ellipse"` | `at: point2` (its center), `r: vec2` (radii), `fill?: color`, `stroke?: color` | `at`; `r` by the scale |
| `"line"` | `points: list<point2>` (two or more), `width: f64`, `stroke: color`, `closed?: bool`, `fill?: color` | every point; `width` by the scale. A polyline, or a polygon when `closed` |
| `"image"` | `at: point2` (its top-left corner), `image: <image>`, `cell?: f64`, `size?: vec2`, `flip?: 'x' \| 'y' \| 'xy'` | `at`; `size` by the scale |
| `"tiles"` | `at: point2` (the top-left corner), `image: <image>`, `grid: list<list<f64>>`, `wrap?: vec2` | `at` only |
| `"text"` | `at: point2` (the top-left corner of the first character), `str: str`, `font: str`, `fill: color` | `at` only |

- **Points and vectors** are plain arrays, `[<x>, <y>]`, in the list's frame.
- **A color** is a string: a color your Dialect names (below), or `"#rrggbb"` / `"#rrggbbaa"`.
- **`image`** draws one picture, or one cell of it (`cell`, a whole number from 0, counting cells left to right, then top to bottom). Without `size` it is drawn at its declared size, measured in the list's frame. `flip` mirrors it.
- **`tiles`** draws a grid of cells of one image: `grid` is a list of rows, each a list of cell numbers (`-1` draws nothing), drawn at the image's cell size, row after row from `at`. `wrap: [<columns>, <rows>]` makes the grid a ring that repeats past that many columns and rows.
- **`text`** is one run of characters. Every renderer in this trial has one font, `"mono"`: each character is 8 by 8 units of the frame the renderer draws in.
- An op's other fields (any not in its row) are refused.

### Naming colors and declaring images

Two Dialect keys, beside `frames`:

```js
// <package>.dialect.js
colors: {                                   // optional: names for colors, like design tokens
  <color1>: "#rrggbb",
  <color2>: "#rrggbbaa",
},
images: {                                   // optional: the pictures your ops may draw
  <image1>: { size: [<w>, <h>], note: "<what it shows>" },
  <image2>: { size: [<w>, <h>], cell: [<cw>, <ch>], note: "<what it shows; what each cell is>" },   // cut into cells of <cw> by <ch>
},
```

- A color name is your Dialect's own. On a wire it crosses as the color it names, so a stranger's list never needs your names.
- `size` is the picture's size in pixels; `cell` cuts it into a grid of cells of that size (each must divide `size`). In this trial an image has no pixel data: renderers draw its box. The declaration is what is checked.
- An image crosses a wire as a reference to your declared image: the part that takes your list can draw it but not name it.

## Building a draw list

A draw list is an **output port with a `Draw` seam**. Its builder runs after each of your steps, on the run's state, as a value output's `from` does. It is lowered like any lambda: the **Runtime Subset** holds, and **there is no `map`** (or `filter`, `forEach`, `reduce`, `push`): a lambda cannot turn a list as long as your state's into another list. Instead, a Dialect builds its list in one of three ways, chosen by its own vocabulary:

```js
// <package>.dialect.js
ports: {
  out: {
    // 1. A whole list: one lambda over the state returns the ops as an array literal.
    <port1>: { seam: "Draw<<max>>@<frame>", note: "<…>",
      from: (s) => [{ op: "<op>", at: [s.<path>.x, s.<path>.y], <…> }, <…>] },

    // 2. One op per item: `each` names a list in your state; `from` gets one item and returns one op, or null for none.
    <port2>: { seam: "Draw<<max>>@<frame>", note: "<…>",
      each: "<path>", from: (<item>, s) => (<test> ? { op: "<op>", <…> } : null) },

    // 3. A pen: the lambda gets a pen and calls one method per op, as many times as it likes, up to the seam's max.
    <port3>: { seam: "Draw<<max>>@<frame>", note: "<…>",
      pen: (s, <pen>) => { for (const <item> of s.<path>) <pen>.<op>({ at: <…>, <…> }); } },
  },
},
```

- **A whole list** (`from` alone) returns an array literal of ops. It may **concatenate** lists with spread inside the literal (`[...<a>, ...<b>, <op>]`); the maxes add. It may also return a single op.
- **One op per item** (`each` and `from`) walks the list at `<path>` in your state (a `list(…, <max>)`), in order, and keeps each op that is not `null`. The list's max is that state list's max. The item is all `from` sees of its place: there is no index.
- **A pen** (`pen`) is handed the state and a pen. Each pen method is named for an op and takes that op's fields as one record, without `op`: `<pen>.rect({ at, size, fill })`, `<pen>.text({ at, str, font, fill })`. Calling a pen method is the lambda's effect, like pushing an Event; it returns nothing. A pen lambda may use `for…of` over a state list and counted loops (`runtime.md`'s subset).
- **Layers.** To mix ways, give `layers`, a list of builders, each written like one of the three above without `seam` and `note`; their lists are concatenated in order, first layer first (underneath). A `pen` layer states its own `max`; an `each` layer's max is its state list's; the seam's `<max>` must hold the sum.

  ```js
  <port>: { seam: "Draw<<max>>@<frame>", note: "<…>", layers: [
    { from: (s) => <op> },
    { each: "<path>", from: (<item>, s) => <op or null> },
    { pen: (s, <pen>) => { <…> }, max: <max> },
  ] },
  ```

- **What a builder reads.** Its own parameters (the state, the item, the pen), and the Dialect file's top-level helpers and constants. It cannot read `$` or your value inputs: if the picture depends on one, copy it into your state in your runtime. Like every value output, it changes nothing.
- A `Draw` output pushes nothing from your runtime and needs no entry in `events`.

### Taking draw lists as inputs

A Dialect that layers other parts' pictures declares `Draw` inputs, and reads them in a whole-list builder through a second parameter:

```js
// <root>.dialect.js
ports: {
  in: {
    <port1>: { seam: "Draw<<max1>>@<frame>", note: "<what it should hold>" },
    <port2>: { seam: "Draw<<max2>>@<frame>", note: "<…>" },
  },
  out: {
    <port3>: { seam: "Draw<<max3>>@<frame>", note: "<…>",
      from: (s, <inputs>) => [...<inputs>.<port1>, ...<inputs>.<port2>, <op>] },   // <max3> ≥ <max1> + <max2> + the ops you add
  },
},
```

- A `Draw` input takes no `default`: unwired, it is an empty list. It arrives already converted into `<frame>` (below).
- Only a whole-list builder (`from` alone, or a `from` layer) gets the inputs, as its second parameter. A pen or `each` builder does not.
- The order of the array literal is the layering: what comes first is drawn first, underneath. Nothing in the kit knows the word "layer".

## On the wire

A `Draw` output feeds a `Draw` input with `.wire`, like any port, and the glue relates their frames with `.frame` (`seams.md`). The kit converts every op from the output's frame into the input's, field by field, as the op table's last column says: positions by the edge's scale and offset, sizes, radii and widths by its scale, and nothing else. The output's max must not exceed the input's (as for `list`).

```js
// workbench.js
.frame(<part1>.frame.<frame1>, <root>.frame.<frame3>, "fit")
.wire(<part1>.out.<port1>, <root>.in.<port2>)
.show(<root>)
```

The page shows the shown part's `Draw` output: if the shown part has one, the renderer draws it; if it has several, the one named `view`. A part with no `Draw` output shows its stage as before.

## Renderers

A **renderer** turns the shown part's draw list into pixels on one target. It draws the list in the shown part's frame, taking one unit of that frame as one pixel, and the frame's `extent` as the screen. Each renderer has a **profile**: the ops it draws, its palette and its limits. It draws what it can exactly, or refuses up front; it never drops an op silently.

| Renderer | Draws | Limits |
|---|---|---|
| Canvas 2D | every op, about one call each | none that matter |
| Game Boy (DMG) | `tiles` as the background map (and a second as the window), `image` cells as sprites, `text` through its font sheet; refuses `rect`, `ellipse`, `line`, and any image whose cells aren't multiples of 8 by 8 pixels or that is drawn at another `size` | 4 shades (each color maps to the nearest by brightness); 40 sprites, 10 on any one row of pixels (a 16-by-16 cell is 4 sprites); 8-by-8 tiles; a 160-by-144 screen |

- **Checked at composition where the types allow:** a `Draw<<max>>` shown on a renderer whose limit is lower is refused when the workbench is composed, naming both sides. Limits that depend on positions (sprites per row) are checked when the list is drawn.
- A package doesn't target a renderer: the page picks one. To run well on a constrained one, a Dialect draws with what that renderer accepts.

## Diagnostics

The trial's checker reports a draw list's problems with W codes (`rules.md`). Errors about a wire carry both sides, as in `seams.md`.

## What does not exist

Transforms inside a list (rotation, a group with its own frame), text longer than one line, fonts other than `"mono"`, pixel data for images, an image or a shader output on a wire, per-pixel fills, 3-D. If you need one, report it as a gap.
