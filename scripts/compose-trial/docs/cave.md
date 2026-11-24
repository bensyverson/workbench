# cave: procedural cave levels

*Generated reference, draft. Import: `import { cave } from "cave";`*

A cave part makes one level: a grid of rock and open cells, carved by a per-cell kernel, smoothed, with spawn points and one exit placed on open cells. It runs on the CPU.

**Clock:** `demand`. The cave re-runs when something it reads changes (a parameter, or another part's output read by its `.seed()` lambda), and its outputs then carry the new level.

**Frame:** `cell`. Positions are whole cells, `vec2i@cell`, with `(0, 0)` the top-left cell and `x` to the right, `y` down.

## Builder

```ts
cave(name: string)                       // a new cave part

  .size(cols: int, rows: int)            // grid size in cells, 8–128 each. Required; fixed at build (no lambda form)
  .seed(n: int | () => int)              // the random seed. A lambda (runtime) when it depends on another part. Default 0
  .carve(fn: (c: Cell) => bool)          // (runtime, CPU) per-cell kernel: true makes the cell rock. Required
  .smooth(passes: int)                   // cellular smoothing passes after carving, 0–8. Default 0
  .spawns(kind: string, opts: {          // spawn points of one kind, placed on distinct open cells
    count: int,                          //   how many, 1–64; fixed at build
    where?: (c: Cell) => bool,           //   (runtime, CPU) which open cells may hold one; default any
  })
  .exit(opts?: {                         // one exit cell, on an open cell. Required
    where?: (c: Cell) => bool,           //   (runtime, CPU) which open cells may hold it; default any
  })
```

Each slot may be called once, except `.spawns`, once per kind. Kinds are identifiers (`"start"`, `"bat"`).

## The cell context

The `c` that `.carve` and `where` receive:

```ts
c.x, c.y: int            // this cell's column and row
c.cell: vec2i@cell       // the same, as a vector
c.size: vec2i            // the grid size (cols, rows)
c.seed: int              // the seed this run uses
c.rand: f32              // a random number in [0, 1) for this cell and seed (same cell, same seed, same number)
```

The outermost ring of cells is always rock, whatever `.carve` returns. Spawn points and the exit never share a cell.

## Outputs

```ts
out.cells:  Grid<'rock' | 'open'>@cell     // the level, size cols × rows
out.spawns: Spawn[]                         // every spawn point, all kinds, in declaration order
out.exit:   vec2i@cell                      // the exit cell

type Spawn = {
  id:   Id,                                 // its address: lab:<program>#<part>.spawns.<kind>[<n>]
  kind: <declared kinds>,                   // e.g. 'start' | 'bat'
  at:   vec2i@cell,                         // its cell
}
```

A spawn's `id` is positional within its kind for a given seed: the same seed gives the same `bat[2]` in the same place; a new seed gives a new `bat[2]`.

## Example (cave alone)

```js
import { cave } from "cave";

export const level = cave("depths")
  .size(32, 20)
  .seed(42)
  .carve(c => c.rand < 0.45)                 // 45 % rock before smoothing
  .smooth(4)
  .spawns("start", { count: 1, where: c => c.x < 8 })
  .spawns("bat", { count: 6, where: c => c.y > 4 })
  .exit({ where: c => c.x > 24 });
```

## Errors this dialect gives

- `.size()` missing, or a size outside 8–128.
- `.carve()` or `.exit()` missing.
- A `.spawns()` kind declared twice; a `count` outside 1–64.
- A kernel lambda outside the kernel subset, or reading a name it cannot see.
