import { defineDialect, exact, list, struct, vector } from "kit/define";

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
  types: { cell2: vector(2, "f64") },
  // The run's state: what the host computes after each tick, and hands text(state), the UI's views and the output
  // ports. One step is one tick. grid is one string per row: "#" a wall, "c" a coin, "." floor.
  //
  // What the host fills for the ports:
  // - player.at is (player.x, player.y). player.move is player.at after the tick minus player.at before it: (0, 0)
  //   when the player stood still.
  // - entered, picked, bumped and cleared are event lists. The host empties all four at the start of each tick,
  //   then appends what happens during that tick, in the order it happens.
  //   - entered: one record for each cell the player walks into (a dash of 3 cells appends 3): at is that cell,
  //     from the cell it left.
  //   - picked: one record for each coin taken: at is the coin's cell.
  //   - bumped: when a wall, or the edge of the grid, stops the walk with cells still to go: at is the cell that
  //     could not be entered, push is (dx, dy). At most one per tick, and again on every tick that tries again.
  //   - cleared: one record on the tick coinsLeft goes from above 0 to 0: at is the last coin's cell.
  // - A list that is full takes no more records that tick; the walk, score and coinsLeft are not affected.
  // - Before the first tick, all four lists are empty, player.move is (0, 0) and player.at is the start cell.
  state: {
    t: "f64",
    score: "f64",
    coinsLeft: "f64",
    player: struct({ x: "f64", y: "f64", at: "cell2", move: "cell2" }),
    grid: list("str", 64),
    entered: list(struct({ at: "cell2", from: "cell2" }), 64),
    picked: list(struct({ at: "cell2" }), 64),
    bumped: list(struct({ at: "cell2", push: "cell2" }), 1),
    cleared: list(struct({ at: "cell2" }), 1),
  },
  frames: {
    cell: {
      dims: 2,
      note: "the maze's grid cells; x right, y down; (0, 0) is the center of the top-left cell, one unit is one cell, so a cell covers half a unit each way from its whole-number center",
      extent: (record) => ({ min: [-0.5, -0.5], max: [Math.max(...record.grid.map((row) => row.length)) - 0.5, record.grid.length - 0.5] }),
    },
  },
  ports: {
    out: {
      player: { seam: "point2@cell", from: "player.at", note: "the center of the cell the player is in after the step; it jumps from cell to cell, with no in-between positions" },
      move: { seam: "vec2@cell", from: "player.move", note: "how far the player moved during this step, in cells; (0, 0) when standing still; a displacement per step, not per second" },
      entered: { seam: "Event<{ at: point2@cell, from: point2@cell }>", from: "entered", note: "the player walked into a cell: once for each cell, in walking order, so a fast walk gives several in one step; at is the cell entered, from the cell left" },
      picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "a coin picked up during this step, at its cell; one record per coin" },
      bumped: { seam: "Event<{ at: point2@cell, push: vec2@cell }>", from: "bumped", note: "a wall or the grid's edge stopped the player during this step; at is the blocked cell (outside the grid at an edge), push the direction tried, -1, 0 or 1 on each axis; repeats every step that keeps trying" },
      cleared: { seam: "Event<{ at: point2@cell }>", from: "cleared", note: "the last coin was picked up during this step, at its cell; happens at most once in a run, and never if the maze starts with no coins" },
      score: { seam: "f64", from: "score", note: "the score after the step" },
      coinsLeft: { seam: "f64", from: "coinsLeft", note: "how many coins are still in the maze after the step" },
      t: { seam: "f64", from: "t", note: "the run's time in seconds" },
    },
  },
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
