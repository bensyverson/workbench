import { defineDialect, exact, list, struct } from "kit/define";

// The picture's scale: units of the pixel frame per cell. THINGS_MAX: the most walls, coins and player together.
const CELL = 8;
const THINGS_MAX = 1024;

// The maze: one player walks a grid of walls and coins, steered by a D-pad and two buttons. Its runtime is
// maze.runtime.js.
export const mazeDialect = defineDialect({
  name: "maze",
  numberType: "f64",
  spaces: {
    // control runs once per tick, handed the player, and may change only the player's intent.
    player: { instance: "Player" },
  },
  objects: {
    Player: {
      label: "the player (pl)",
      members: {
        x: "f64", // the runtime moves the player; control reads where it is
        y: "f64",
        dx: { value: "f64", write: true }, // -1, 0 or 1: the direction to walk this tick
        dy: { value: "f64", write: true },
        steps: { value: "f64", write: true }, // cells to walk this tick, 0 to stand still
      },
    },
    // The runtime fills Pad from controls.pad: each member is true while that button is held, as of the
    // start of the tick. The UI declaration names this object.
    Pad: {
      label: "the pad (pad)",
      members: { up: "bool", down: "bool", left: "bool", right: "bool", a: "bool", b: "bool" },
    },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  // the picture's builders are Bench code: they read the cell size as a Library constant, not the file's CELL
  library: { CELL: { const: String(CELL) } },
  slots: {
    control: { params: ["Player", "Pad"], returns: "void", space: "player", body: "block", may: ["write Player"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    return { objects: { Params: { members: params } } };
  },
  // The run's state: what the runtime computes after each tick, and hands text(state) and the UI's views.
  // grid is one string per row: "#" a wall, "c" a coin, "." floor.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64" }),
    grid: list("str", 64),
    // the grid's size in cells, for the picture: a builder reads no string's length
    size: struct({ cols: "f64", rows: "f64" }),
    // What stands in the maze, one record per thing, for the picture: kind is "wall", "coin" or "player" (last).
    things: list(struct({ kind: "str", x: "f64", y: "f64" }), THINGS_MAX),
  },
  colors: { floor: "#101828", wall: "#4a6fa5", coin: "#ffd23f", player: "#ff5d73" },
  // Grid cells: x counts columns to the right, y rows down; (0, 0) is the center of the top-left cell.
  frames: {
    cell: {
      dims: 2,
      note: "grid cells; x counts columns to the right, y rows down; (0, 0) is the center of the top-left cell, and one unit is one cell",
      extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }),
    },
    pixel: {
      dims: 2,
      note: "the maze's picture; x right, y down; (0, 0) is the top-left corner of the top-left cell, and one cell is 8 units",
      extent: (record) => ({ min: [0, 0], max: [record.grid[0].length * CELL, record.grid.length * CELL] }),
    },
  },
  // A cell's center is half a cell in from its top-left corner.
  edges: () => [{ from: "cell", to: "pixel", scale: CELL, offset: CELL / 2 }],
  ports: {
    out: {
      coin: { seam: "Event<{ cell: point2@cell }>", note: "a coin the player picked up during this step, at the cell it lay in; one record per coin, none on most steps" },
      player: { seam: "point2@cell", from: (s) => [s.player.x, s.player.y], note: "the cell the player stands in after this step" },
      score: { seam: "f64", from: "score", note: "coins picked up so far" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "coins still in the maze" },
      t: { seam: "point1@s", from: "t", note: "the time of this step since the maze started, in seconds" },
      view: {
        seam: "Draw<1025>@pixel",
        max: (record) => 1 + record.grid.length * record.grid[0].length,
        note: "the whole maze after this step, in pixel (8 units per cell): an opaque floor rectangle, then a square per wall, a small disc per coin not yet picked up, and last a large disc for the player",
        layers: [
          { from: (s) => ({ op: "rect", at: [0, 0], size: [s.size.cols * CELL, s.size.rows * CELL], fill: "floor" }) },
          {
            each: "things",
            from: (thing, s) =>
              thing.kind === "wall"
                ? { op: "rect", at: [thing.x * CELL, thing.y * CELL], size: [CELL, CELL], fill: "wall" }
                : {
                    op: "ellipse",
                    at: [thing.x * CELL + CELL / 2, thing.y * CELL + CELL / 2],
                    r: thing.kind === "coin" ? [CELL / 4, CELL / 4] : [(CELL * 3) / 8, (CELL * 3) / 8],
                    fill: thing.kind === "coin" ? "coin" : "player",
                  },
          },
        ],
      },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
