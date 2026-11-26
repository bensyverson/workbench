// Test-only Dialects with seams, after the relay trial's maze and particles packages as the seams draft is ruled
// (2026-11-26): maze offers an Event output with no `from`, a point built by a lambda from two scalars, and a
// score; particles takes an Event input whose record its spawn lambdas read as `ev`, and a value input read as
// `inp.radius`. Each declaration is a fresh object, so a test can change one key. No test lives here.

import { defineDialect, defineGrammar, exact, list, struct, vector, name, ref, data, lambda } from "../index.js";

/** @returns {Record<string, any>} */
export const mazeDecl = () => ({
  name: "maze",
  numberType: "f64",
  types: { cell2: vector(2, "f64") },
  spaces: { player: { instance: "Player" } },
  objects: {
    Player: { label: "the player (pl)", members: { x: "f64", y: "f64", dx: { value: "f64", write: true }, dy: { value: "f64", write: true } } },
    Pad: { label: "the pad (pad)", members: { up: "bool", down: "bool", left: "bool", right: "bool" } },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { control: { params: ["Player", "Pad"], returns: "void", space: "player", body: "block", may: ["write Player"] } },
  params: { object: "Params", name: "$" },
  state: {
    t: "f64",
    score: "f64",
    player: struct({ x: "f64", y: "f64" }),
    home: "cell2",
    grid: list("str", 64),
  },
  frames: {
    cell: {
      dims: 2,
      note: "grid cells; x right, y down; (0, 0) is the center of the top-left cell",
      extent: (/** @type {any} */ record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }),
    },
  },
  ports: {
    out: {
      picked: { seam: "Event<{ at: point2@cell }>", note: "a coin the player picked up during this tick, at its cell; empty most ticks" },
      player: { seam: "point2@cell", from: (/** @type {any} */ s) => [s.player.x, s.player.y], note: "the cell the player stands in after this tick" },
      home: { seam: "point2@cell", from: "home", note: "the start cell" },
      score: { seam: "f64", from: "score", note: "coins picked up so far" },
    },
  },
  text: () => "",
});

/** @returns {Record<string, any>} */
export const particlesDecl = () => ({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64", { multiply: "scalar" }) },
  spaces: { emitter: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Particle: { label: "the particle (p)", members: { pos: { value: "vec2", write: true }, vel: { value: "vec2", write: true }, life: { value: "f64", write: true } } },
    Rng: { label: "spawn's random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Params: { label: "the params ($)", members: {} },
    In: { label: "the inputs (inp)", members: {} },
  },
  globals: { $: "Params", inp: "In" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "emitter" },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle", "rng"] },
  },
  params: { object: "Params", name: "$" },
  state: { t: "f64", bounds: struct({ width: "f64", height: "f64" }) },
  frames: {
    px: { dims: 2, note: "pixels in the bounds; x right, y down; (0, 0) is the top-left corner", extent: (/** @type {any} */ record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] }) },
  },
  ports: {
    in: {
      burst: { seam: "Event<{ at: point2@px }>", note: "fires every emitter whose trigger is 'burst', once per record, at its position", record: { name: "ev", slots: ["spawn"] } },
      radius: { seam: "f64@px", default: 40, note: "how far a burst spreads, in pixels" },
      wind: { seam: "vec2@px/s", default: [0, 0], note: "a steady push on every particle" },
    },
  },
  inputs: { object: "In", name: "inp" },
  text: () => "",
});

/** @param {any} dialect */
export const mazeGrammar = (dialect) => defineGrammar(dialect, {
  root: "maze",
  params: { slot: "param" },
  constructs: {
    maze: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" },
        grid: { kind: "decl", args: [data("string[]")], once: true, required: true },
        tick: { kind: "decl", args: [data("number", { min: 0.01, max: 1 })], once: true },
        control: { kind: "decl", args: [lambda("control")], once: true, required: true },
      },
    },
  },
});

/** @param {any} dialect @param {unknown} [trigger]  the trigger option's spec */
export const particlesGrammar = (dialect, trigger = ref("in", { kind: "event" })) => defineGrammar(dialect, {
  root: "particles",
  constructs: {
    particles: {
      opens: [name()],
      slots: { bounds: { kind: "decl", args: [data({ width: "number", height: "number" })], once: true, required: true } },
    },
    emitter: {
      parent: "particles",
      opens: [name(), data({ x: "number", y: "number", "trigger?": trigger }, { as: "opts" })],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
    },
  },
});

export const GRID = ["#####", "#.c.#", "#####"];
export const maze = () => mazeGrammar(defineDialect(/** @type {any} */ (mazeDecl())));
export const particles = () => particlesGrammar(defineDialect(/** @type {any} */ (particlesDecl())));
