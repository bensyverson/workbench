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
  // One space: the grid, one unit per cell. Cell centres are whole numbers, so a position is the cell itself.
  frames: {
    cell: {
      dims: 2,
      note: "the maze grid, one unit = one cell. x points right (columns), y points down (rows). (0, 0) is the CENTRE of the top-left cell, so column i, row j is centred at (i, j) and covers i-0.5..i+0.5 by j-0.5..j+0.5. The grid includes its walls.",
      extent: (record) => ({ min: [-0.5, -0.5], max: [Math.max(...record.grid.map((row) => row.length)) - 0.5, record.grid.length - 0.5] }),
    },
  },
  ports: {
    out: {
      pickup: {
        seam: "Event<{ at: point2@cell, score: f64, left: f64 }>",
        note: "one record per coin picked up, at the step that picks it, in walking order (at most 4 per step). at: centre of the coin's cell (cell frame). score: coins picked up so far, this one included (1, 2, …). left: coins still in the maze (0 on the last).",
      },
      entered: {
        seam: "Event<{ at: point2@cell, by: vec2@cell }>",
        note: "one record per cell the player walks into (footsteps), in walking order (at most 4 per step). at: centre of the new cell (cell frame). by: the move into it, one cell long: (1,0) right, (-1,0) left, (0,1) down, (0,-1) up.",
      },
      bumped: {
        seam: "Event<{ at: point2@cell, toward: vec2@cell }>",
        note: "one record when the player is first stopped by a wall or the grid's edge; not repeated while it keeps pushing the same way from the same cell. at: the player's cell centre (cell frame). toward: one cell long, pointing into the wall.",
      },
      cleared: {
        seam: "Event<{ at: point2@cell, score: f64 }>",
        note: "one record, once per run, at the step that picks up the last coin. at: that coin's cell centre (cell frame). score: coins picked up in all.",
      },
      player: {
        seam: "point2@cell",
        from: (s) => [s.player.x, s.player.y],
        note: "the player's position, a cell centre (cell frame). Jumps by whole cells when the maze steps; it does not glide in between.",
      },
      velocity: {
        seam: "vec2@cell/s",
        from: (s) => [s.motion.x, s.motion.y],
        note: "the player's movement in the last step divided by the step's length (cells per second, cell frame, y down); (0, 0) when it stood still.",
      },
      period: { seam: "f64@s", from: "period", note: "seconds between the maze's steps, the time a smooth follower has to cover one jump; constant for a run." },
      score: { seam: "f64", from: "score", note: "coins picked up so far, a plain count from 0." },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "coins still in the maze, a plain count down to 0." },
    },
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  // grid is one string per row: "#" a wall, "c" a coin, "." floor.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64" }),
    grid: list("str", 64),
    period: "f64", // seconds per step
    motion: struct({ x: "f64", y: "f64" }), // cells per second over the last step
    pushing: struct({ x: "f64", y: "f64" }), // the direction a wall is stopping, (0, 0) when none
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
