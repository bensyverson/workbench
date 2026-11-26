// The game package: a miner walks a level one cell per tick, steered by a pad, and goes down a level by reaching
// the exit. It reads the level's start and exit cells as inputs; when the start it reads moves, it puts the miner
// there (a new level arrived). Its outputs are the depth and the miner's cell.

import { defineDialect, defineGrammar, defineRuntime, exact, struct, vector, name, data, lambda } from "kit/define";

export const gameDialect = defineDialect(/** @type {any} */ ({
  name: "game",
  numberType: "f64",
  types: { cell2: vector(2, "f64") },
  spaces: { miner: { instance: "Miner" } },
  objects: {
    Miner: { label: "the miner (m)", members: { x: "f64", y: "f64", dx: { value: "f64", write: true }, dy: { value: "f64", write: true } } },
    Pad: { label: "the pad (pad)", members: { up: "bool", down: "bool", left: "bool", right: "bool" } },
    Params: { label: "the params ($)", members: {} },
    In: { label: "the inputs (inp)", members: {} },
  },
  globals: { $: "Params", inp: "In" },
  targets: { js: { accepts: "*", compare: exact() } },
  // sets the miner's move this tick (dx, dy: -1, 0 or 1) from the pad
  slots: { control: { params: ["Miner", "Pad"], returns: "void", space: "miner", body: "block", may: ["write Miner"] } },
  params: { object: "Params", name: "$" },
  state: { t: "f64", depth: "f64", miner: struct({ x: "f64", y: "f64" }), start: "cell2", cleared: "bool" },
  frames: { cell: { dims: 2, note: "grid cells; x right, y down; (0, 0) is the center of the top-left cell" } },
  ports: {
    in: {
      start: { seam: "point2@cell", default: [-1, -1], note: "the level's start cell; when it moves, a new level has arrived" },
      exit: { seam: "point2@cell", default: [-1, -1], note: "the level's exit cell" },
    },
    out: {
      depth: { seam: "f64", from: "depth", note: "how many levels down the miner is" },
      miner: { seam: "point2@cell", from: (/** @type {any} */ s) => [s.miner.x, s.miner.y], note: "the miner's cell" },
    },
  },
  inputs: { object: "In", name: "inp" },
  text: () => "",
}));

export const game = defineGrammar(gameDialect, {
  root: "game",
  params: { slot: "param" },
  constructs: {
    game: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" },
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        control: { kind: "decl", args: [lambda("control")], once: true, required: true },
      },
    },
  },
});

const IDLE = { up: false, down: false, left: false, right: false };

/**
 * One tick: a new level puts the miner at its start; the pad moves the miner; reaching the exit goes down one level.
 * The next level arrives some ticks later (the host rebuilds the cave between chunks), so `cleared` stops this level
 * counting again until then, even if the miner stays on the exit or steps off and back.
 */
export function gameStep(/** @type {any} */ s, /** @type {any} */ ctx) {
  const [sx, sy] = ctx.inputs.start;
  const arrived = sx !== s.start[0] || sy !== s.start[1];
  const at = arrived ? { x: sx, y: sy } : s.miner;
  const m = { x: at.x, y: at.y, dx: 0, dy: 0 };
  ctx.kernels.control(m, ctx.controls.pad ?? IDLE);
  const miner = { x: at.x + m.dx, y: at.y + m.dy };
  const [ex, ey] = ctx.inputs.exit;
  const onExit = miner.x === ex && miner.y === ey;
  const cleared = !arrived && s.cleared;
  const goDown = onExit && !cleared;
  return { t: s.t + ctx.dt, depth: goDown ? s.depth + 1 : s.depth, miner, start: [sx, sy], cleared: cleared || goDown };
}

export const gameRuntime = defineRuntime(game, {
  clock: (/** @type {any} */ r) => ({ tick: r.tick ?? 1 / 30 }),
  init: () => ({ t: 0, depth: 0, miner: { x: -1, y: -1 }, start: [-1, -1], cleared: false }),
  step: gameStep,
});
