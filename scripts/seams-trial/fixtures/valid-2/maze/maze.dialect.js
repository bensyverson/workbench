import { defineDialect, exact, list, struct } from "kit/define";

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
    // the D-pad as the last record the pad input gave: held until the next one
    pad: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64" }),
    grid: list("str", 64),
  },
  // Grid cells: x counts columns to the right, y rows down; (0, 0) is the center of the top-left cell.
  frames: {
    cell: {
      dims: 2,
      note: "grid cells; x counts columns to the right, y rows down; (0, 0) is the center of the top-left cell, and one unit is one cell",
      extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }),
    },
  },
  ports: {
    in: {
      pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "the D-pad: one record each time the held directions change, each field true while that direction is held" },
    },
    out: {
      coin: { seam: "Event<{ cell: point2@cell }>", note: "a coin the player picked up during this step, at the cell it lay in; one record per coin, none on most steps" },
      player: { seam: "point2@cell", from: (s) => [s.player.x, s.player.y], note: "the cell the player stands in after this step" },
      score: { seam: "f64", from: "score", note: "coins picked up so far" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "coins still in the maze" },
      t: { seam: "point1@s", from: "t", note: "the time of this step since the maze started, in seconds" },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
