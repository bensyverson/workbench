import { defineDialect, exact, list, struct, vector } from "kit/define";

// The maze: one player walks a grid of walls and coins, steered by a D-pad and two buttons. The UI trial's
// input-driven case (docs/task.md, "Maze"); the host is described there in prose and is not built. What the host
// writes into the run's state after each tick, including the lists the Event outputs read, is described at state.
export const mazeDialect = defineDialect({
  name: "maze",
  numberType: "f64",
  conditions: "bool",
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
  types: { cell2: vector(2, "f64") },
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
  // grid is one string per row: "#" a wall, "c" a coin, "." floor. The host blanks a coin's "c" to "." when it is
  // picked up.
  //
  // After each tick the host also fills:
  //   player.at   the player's cell, the same numbers as [player.x, player.y].
  //   picked      one record per coin picked up during this tick, in the order the player reached them, at the coin's
  //               cell. A tick can walk several cells (steps), so it can pick up several coins.
  //   bumped      one record per time during this tick the player tried to step into a wall and stayed put, at the
  //               wall's cell. A tick that stops at a wall adds one record for that wall, not one per remaining step.
  //   cleared     one record, at the cell where the last coin was picked up, on the tick coinsLeft becomes 0; else empty.
  // The host empties picked, bumped and cleared at the start of every tick, before it moves the player, so after a
  // tick they hold only what happened during that tick.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64", at: "cell2" }),
    grid: list("str", 64),
    picked: list(struct({ at: "cell2" }), 8),
    bumped: list(struct({ at: "cell2" }), 8),
    cleared: list(struct({ at: "cell2" }), 1),
  },
  frames: {
    cell: {
      dims: 2,
      note: "maze grid cells, one unit per cell; x grows to the right along a row, y grows downward from row to row; (0, 0) is the center of the top-left cell of the grid, so the cell at column x, row y is at (x, y) and its edges are at x ± 0.5, y ± 0.5",
      extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }),
    },
    sec: { dims: 1, note: "seconds of run time; 0 when the run starts, growing by the Program's tick (1/8 s unless set) each tick" },
  },
  ports: {
    out: {
      picked: {
        seam: "Event<{ at: point2@cell }>",
        from: "picked",
        note: "a coin picked up during this tick, at the coin's cell (the center of that cell); several in one tick when the player walks more than one cell",
      },
      bumped: {
        seam: "Event<{ at: point2@cell }>",
        from: "bumped",
        note: "the player tried to walk into a wall during this tick and stopped; at is the wall's cell, next to the player",
      },
      cleared: {
        seam: "Event<{ at: point2@cell }>",
        from: "cleared",
        note: "the last coin was picked up during this tick, so the maze is cleared; at is that coin's cell. Happens at most once per run",
      },
      player: {
        seam: "point2@cell",
        from: "player.at",
        note: "the cell the player stands in after this tick; jumps a whole cell at a time, never between cells",
      },
      score: { seam: "f64", from: "score", note: "coins picked up so far this run; changes only on a tick that has picked records" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "coins still in the maze; 0 once the maze is cleared" },
      t: { seam: "f64@sec", from: "t", note: "run time in seconds after this tick" },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
