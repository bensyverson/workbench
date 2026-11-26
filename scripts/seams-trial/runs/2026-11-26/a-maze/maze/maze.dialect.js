import { defineDialect, exact, list, struct } from "kit/define";

// The maze: one player walks a grid of walls and coins, steered by a D-pad and two buttons. The UI trial's
// input-driven case (docs/task.md, "Maze"); the host is described there in prose and is not built.
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
        x: "f64", // the host moves the player; control reads where it is
        y: "f64",
        dx: { value: "f64", write: true }, // -1, 0 or 1: the direction to walk this tick
        dy: { value: "f64", write: true },
        steps: { value: "f64", write: true }, // cells to walk this tick, 0 to stand still; whole cells, at most 4
      },
    },
    // The host fills Pad from its input events: each member is true while that button is held, sampled once at the
    // start of the tick. The UI declaration names this object (docs/ui-draft.md, "Inputs").
    Pad: {
      label: "the pad (pad)",
      members: { up: "bool", down: "bool", left: "bool", right: "bool", a: "bool", b: "bool" },
    },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    control: { params: ["Player", "Pad"], returns: "void", space: "player", body: "block", may: ["write Player"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    return { objects: { Params: { members: params } } };
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  // grid is one string per row: "#" a wall, "c" a coin, "." floor.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64" }),
    grid: list("str", 64),
    velocity: struct({ x: "f64", y: "f64" }), // cells per second walked during the last tick
  },
  frames: {
    cell: {
      dims: 2,
      note: "the maze's grid: x runs right along a row, y runs down the rows, one unit is one cell's side. The center of the top-left cell is [0, 0], so the cell in column c, row r has its center at [c, r] and covers half a unit to each side",
      extent: (record) => ({
        min: [-0.5, -0.5],
        max: [record.grid.reduce((w, row) => Math.max(w, row.length), 0) - 0.5, record.grid.length - 0.5],
      }),
    },
  },
  ports: {
    out: {
      pickup: {
        seam: "Event<{ pos: point2@cell, vel: vec2@cell/s, score: f64, left: f64 }>",
        note: "one record per coin picked up, in the order walked, pushed by the tick that picked it: pos is the center of the coin's cell, vel the player's velocity over that tick, score the coins collected including this one, left the coins still in the maze after it. Usually none; at most 4 in a tick",
      },
      move: {
        seam: "Event<{ pos: point2@cell, from: point2@cell, vel: vec2@cell/s }>",
        note: "one record per cell the player walks into (a footstep), in order: pos is the center of the cell entered, from the center of the cell left, vel the player's velocity over that tick. At most 4 in a tick",
      },
      bump: {
        seam: "Event<{ pos: point2@cell, wall: point2@cell }>",
        note: "one record on each tick in which the player tries to walk into a wall or off the grid, repeating every tick while they keep pushing: pos is the center of the player's cell, wall the center of the blocked cell (the horizontal one if both ways of a diagonal are blocked)",
      },
      finish: {
        seam: "Event<{ pos: point2@cell, score: f64 }>",
        note: "one record, once per run, on the tick that picks up the last coin: pos is the center of that coin's cell, score the coins collected",
      },
      player: { seam: "point2@cell", from: (s) => [s.player.x, s.player.y], note: "the center of the cell the player is in after the last tick; it jumps from cell to cell, with nothing in between" },
      velocity: { seam: "vec2@cell/s", from: (s) => [s.velocity.x, s.velocity.y], note: "the player's net displacement in the last tick divided by the tick's length, in cells per second (y down); zero when they did not move. Holds until the next tick" },
      score: { seam: "f64", from: "score", note: "coins collected so far, a count" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "coins still in the maze, a count" },
      cellSize: { seam: "f64@cell", from: () => 1, note: "the side of one cell, always 1 cell; wire it to a size or radius to get a cell's width in your own units" },
      done: { seam: "bool", from: (s) => s.coinsLeft === 0, note: "true while no coins are left" },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
