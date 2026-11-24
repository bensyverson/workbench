# tiles: a grid game

*Generated reference, draft. Import: `import { tiles, actor, tile, cell, grid, points } from "tiles";`*

A tiles part is a small top-down game: a background of tiles, actors that move in pixels, one player steered by input, world state, events, and outputs other parts may read. It runs on the CPU.

**Clock:** `tick(60)`. The game steps 60 times a second: input, then every actor's `update`, then the world's `update`.

**Frame:** `px`, 8 pixels per cell. Positions are `vec2@px` (the actor's center, `(0, 0)` the top-left pixel). The tile grid is `cell`.

## Builder

```ts
tiles(name: string)                         // a new tiles part

  .screen(width: int, height: int)          // screen size in px, multiples of 8, 64–1024. Required; fixed at build
  .tiles(kinds: { [tile: string]: {         // the tile kinds. Required
    color: string,                          //   CSS color, e.g. '#223'
    solid?: bool,                           //   blocks movement. Default false
  }})
  .map(grid: Grid@cell, values: {           // the background. Required. Its shape must be (width/8) × (height/8)
    [gridValue: string]: string })          //   each value the grid holds → a tile kind; every value needs one
  .spawn(kind: Actor, from: Spawn[], opts: {// one actor per spawn point of one kind
    kind: string,                           //   the spawn kind to use
    init?: (s: Spawn) => { [field]: value } //   (runtime, CPU) the actor's starting fields, including pos
  })
  .player(kind: Actor)                      // the actor steered by input; it must be spawned exactly once
  .state(fields: { [name]: [type, initial] })      // world state, kept across level reloads
  .event(name: string, fields: { [name]: type })   // declares an event the world or actors may emit
  .update(fn: (w: World) => void)           // (runtime, CPU) the world's step, after the actors'
  .export(name: string, type: SeamType,     // adds an output, out.<name>: Signal<type>
          read: (w: World) => value)        //   (runtime, CPU) computed after each step
```

`.screen`, `.tiles`, `.map`, `.player` and `.update` may be called once each; `.spawn`, `.state`, `.event` and `.export` once per kind or name.

```ts
actor(name: string)                         // an actor kind, used by .spawn and .player
  .look(opts: { color: string, glyph?: string })     // how it draws: a colored square, or a glyph
  .state(fields: { [name]: [type, initial] })        // typed fields beside the built-in ones
  .update(fn: (self: Actor, w: World) => void)       // (runtime, CPU) each live actor's step
```

**Types** for `.state`, `.event` and `.export`: `'f32'`, `'int'`, `'bool'`, `'vec2'`, `'vec2@px'`, `'vec2i@cell'`, or an enum written `'idle|chase'`. A vector's initial value is `[x, y]`.

**Literal inputs**, for a game on its own (build time):

```ts
grid(rows: string[], legend: { [char]: string }): Grid@cell   // one string per row, e.g. grid(['###', '#.#'], { '#': 'rock', '.': 'open' })
points(kind: string, cells: [int, int][]): Spawn[]            // spawn points of one kind, at these cells
```

## Inside a lambda

An actor (`self`, `w.player`, and what `w.all` yields):

```ts
self.id: Id                 // its address; for a spawned actor, the spawn point's id
self.pos: vec2@px           // its center
self.<field>                // its .state fields
self.remove()               // removes it at the end of this tick
```

The world `w`:

```ts
w.dt: f32                   // seconds per tick (1/60)
w.time: f32                 // seconds since the level loaded
w.input.dir: vec2           // the arrow keys: each component -1, 0 or 1
w.input.fire: bool          // the space bar, held
w.player: Actor             // the player actor
w.state.<name>              // world state; assignable
w.move(a: Actor, d: vec2)   // moves a by d pixels, stopping at solid tiles
w.tileAt(p: vec2@px): string                // the tile kind under a pixel
w.all(kind: Actor): Actor[]                 // the live actors of a kind, for for…of
w.touching(a: Actor, kind: Actor): Actor[]  // live actors of a kind overlapping a
w.emit(event: string, record)               // emits a declared event
w.end(reason: string)                       // ends the game
```

**Conversions** (functions of this dialect, for its lambdas; import them):

```ts
tile(c: vec2i@cell): vec2@px    // a cell's center in px: c * 8 + 4
cell(p: vec2@px): vec2i@cell    // the cell holding a pixel
```

## Outputs

```ts
out.image: Image@px                  // the drawn screen, width × height
out.events.<name>: Event<record>     // each declared event, the batch emitted during the last tick
out.<name>: Signal<type>             // each .export(name, type, read)
```

**Reloading.** When the grid given to `.map` or a `from` given to `.spawn` changes (a new level from another part), the game reloads at its next tick: the map is replaced, spawned actors are created afresh from the new spawn points (`init` runs again), and world state is kept.

## Example (tiles alone)

```js
import { tiles, actor, tile, grid, points } from "tiles";

const Hero = actor("Hero").look({ color: "#fd4", glyph: "@" })
  .update((self, w) => { w.move(self, w.input.dir * 1.5); });

export const game = tiles("room")
  .screen(64, 64)
  .tiles({ wall: { color: "#334", solid: true }, floor: { color: "#111" } })
  .map(grid(["########", "#......#", "#......#", "#......#",
             "#......#", "#......#", "#......#", "########"], { "#": "rock", ".": "open" }),
       { rock: "wall", open: "floor" })
  .spawn(Hero, points("start", [[2, 2]]), { kind: "start", init: s => ({ pos: tile(s.at) }) })
  .player(Hero)
  .state({ steps: ["int", 0] })
  .update(w => { w.state.steps += 1; })
  .export("steps", "int", w => w.state.steps);
```

## Errors this dialect gives

- `.screen`, `.tiles`, `.map`, `.player` or `.update` missing; a screen size that is not a multiple of 8.
- A map value with no tile kind, or a tile kind not declared in `.tiles`.
- An actor given to `.player` that is not spawned exactly once.
- An unknown member of `w`, `self`, `w.state` or a spawn `s`; an event emitted but not declared.
- A kernel lambda outside the kernel subset, or reading a name it cannot see.
