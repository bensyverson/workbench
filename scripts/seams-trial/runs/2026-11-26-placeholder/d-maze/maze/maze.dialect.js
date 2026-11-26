import { defineDialect, exact, list, struct } from "kit/define";

// The maze: one player walks a grid of walls and coins, steered by a D-pad and two buttons. The UI trial's
// input-driven case; the host is not built.
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
        steps: { value: "f64", write: true }, // cells to walk this tick, 0 to stand still
      },
    },
    // The host fills Pad from its input events: each member is true while that button is held, sampled once at the
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
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  // grid is one string per row: "#" a wall, "c" a coin, "." floor.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64" }),
    grid: list("str", 64),
  },
  // The cell frame: the grid a player walks. A point is a position in it; a cell (column c, row r) is the point
  // [c + 0.5, r + 0.5], its centre. The extent is the grid, so a composer can fit it to another frame.
  frames: {
    cell: {
      dims: 2,
      note: "The maze grid in cells: x grows to the right (column), y grows down (row), the origin is the top-left corner of the grid, and one unit is one cell. A point is at a cell's centre: column c, row r is [c + 0.5, r + 0.5].",
      extent: (record) => ({ min: [0, 0], max: [Math.max(...record.grid.map((row) => row.length)), record.grid.length] }),
    },
  },
  // What the maze offers. The value outputs are signals, fresh after each tick; coin is an Event, pushed by the runtime.
  ports: {
    out: {
      position: {
        seam: "point2@cell",
        from: (s) => [s.player.x + 0.5, s.player.y + 0.5],
        note: "where the player is, in cell frame, at a cell's centre; it moves at most a few cells per tick, and stays put when a wall blocks it.",
      },
      elapsed: {
        seam: "f64@s",
        from: "t",
        note: "seconds of maze time since the run began, advancing by each tick's length; the instant the state describes.",
      },
      score: {
        seam: "f64",
        from: "score",
        note: "the number of coins the player has picked up so far, a whole number from 0 up; it only goes up.",
      },
      coinsLeft: {
        seam: "f64",
        from: "coinsLeft",
        note: "the number of coins still on the grid, a whole number from the grid's count down to 0; reaching 0 means every coin is taken.",
      },
      coin: {
        seam: "Event<{ at: point2@cell, when: point1@s, score: f64 }>",
        note: "one record per coin picked up, in pickup order. at: the coin's cell, in cell frame, at its centre. when: the maze time of the tick that picked it up, in seconds. score: the score after this pickup.",
      },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
