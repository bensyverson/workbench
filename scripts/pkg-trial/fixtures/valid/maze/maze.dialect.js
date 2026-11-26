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
  text(state) {
    const rows = state.grid.map((row, y) => [...row].map((ch, x) => (x === state.player.x && y === state.player.y ? "@" : ch)).join(""));
    return [`t=${state.t.toFixed(2)} score=${state.score} coins=${state.coinsLeft}`, ...rows].join("\n");
  },
});
