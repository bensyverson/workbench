import { defineDialect, exact, list, struct, vector } from "kit/define";

// The maze: one player walks a grid of walls and coins, steered by a D-pad and two buttons. The UI trial's
// input-driven case (docs/task.md, "Maze"); the host is described there in prose and is not built.
export const mazeDialect = defineDialect({
  name: "maze",
  numberType: "f64",
  types: { cell2: vector(2, "f64") },
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
        steps: { value: "f64", write: true }, // cells to walk this tick, 0 to stand still
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
  // Host duties added for ports (version 0.2.0):
  //   player.at is the cell the player stands in; the host sets it to the same cell as player.x and player.y.
  //   picked is refilled after each step with the coins picked up during that step, one { at } per coin, at the
  //   coin's cell; the host empties it at the start of the next step. On a step with no pickup it is empty.
  //   t is the time in seconds since the run started; the host advances it by the tick length each step.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64", at: "cell2" }),
    grid: list("str", 64),
    picked: list(struct({ at: "cell2" }), 8),
  },
  // Frames: where things are, and what unit time is in. A stranger relates these to their own frames in a glue program.
  frames: {
    cell: {
      dims: 2,
      note: "grid cells: x counts columns to the right, y counts rows down; (0, 0) is the center of the top-left cell",
      extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }),
    },
    time: { dims: 1, note: "seconds since the run started" },
  },
  // Outputs a stranger can wire: the player's cell, what was picked up this step, and the run's totals.
  ports: {
    out: {
      player: { seam: "point2@cell", from: "player.at", note: "the cell the player stands in, in the cell frame; changes when the player walks" },
      picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "a coin picked up during this step, at its cell in the cell frame; usually none" },
      score: { seam: "f64", from: "score", note: "the run's score so far, as the host keeps it" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "how many coins are still on the grid; 0 once all are picked up" },
      t: { seam: "f64@time", from: "t", note: "time since the run started, in seconds; changes on every step" },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
