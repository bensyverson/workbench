// The cave package: a level generated at build time. Its Program carves the rock from a seed, a depth and a
// roughness, and places the start and the exit; the part holds the result and steps on demand. Its outputs are the
// start and exit cells, which a game reads.

import { defineDialect, defineGrammar, defineRuntime, exact, list, vector, name, data, lambda } from "kit/define";

export const caveDialect = defineDialect(/** @type {any} */ ({
  name: "cave",
  numberType: "f64",
  types: { cell2: vector(2, "f64") },
  spaces: { cell: { pure: true } },
  objects: { Params: { label: "the params ($)", members: {} } },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  // a cell's shade on the map (0 dark, 1 lit), from its x, y and whether it is rock
  slots: { shade: { params: ["f64", "f64", "bool"], returns: "f64", space: "cell" } },
  params: { object: "Params", name: "$" },
  environment(/** @type {any} */ program) {
    /** @type {Record<string, string>} */
    const members = {};
    for (const p of Object.keys(program.params ?? {})) members[p] = "f64";
    return { objects: { Params: { members } } };
  },
  state: { grid: list("str", 32), start: "cell2", exit: "cell2" },
  frames: {
    cell: {
      dims: 2,
      note: "grid cells; x right, y down; (0, 0) is the center of the top-left cell",
      extent: (/** @type {any} */ r) => ({ min: [-0.5, -0.5], max: [r.grid[0].length - 0.5, r.grid.length - 0.5] }),
    },
  },
  ports: {
    out: {
      start: { seam: "point2@cell", from: "start", note: "the cell the player starts this level in" },
      exit: { seam: "point2@cell", from: "exit", note: "the cell that leads down to the next level" },
    },
  },
  text: () => "",
}));

export const cave = defineGrammar(caveDialect, {
  root: "cave",
  params: { slot: "param" },
  constructs: {
    cave: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" },
        grid: { kind: "decl", args: [data("string[]")], once: true, required: true },
        start: { kind: "decl", args: [data({ x: "number", y: "number" })], once: true, required: true },
        exit: { kind: "decl", args: [data({ x: "number", y: "number" })], once: true, required: true },
        shade: { kind: "decl", args: [lambda("shade")], once: true },
      },
    },
  },
});

export const caveRuntime = defineRuntime(cave, {
  clock: () => ({ demand: true }),
  init: (/** @type {any} */ r) => ({ grid: r.grid, start: [r.start.x, r.start.y], exit: [r.exit.x, r.exit.y] }),
  step: (/** @type {any} */ s) => s,
});
