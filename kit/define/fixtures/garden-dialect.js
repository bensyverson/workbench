// A test-only Dialect with per-slot effects: the packet's garden (scripts/define-trial/docs/api-effects.md).
// Plants grow and are sown in an instance space; the weather's rain rate is pure and reads the totals that grow
// bumps. `gardenDef()` returns a fresh definition each call, so a test can break one key of it; `gardenGrammar`
// is a Grammar over any Dialect made from it. No test lives here.

import { defineGrammar, vector, exact, name, data, lambda } from "../index.js";

/** @returns {Record<string, any>} a fresh garden definition */
export const gardenDef = () => ({
  name: "garden",
  numberType: "f64",
  text: (/** @type {unknown} */ state) => JSON.stringify(state),
  types: { vec2: vector(2, "f64") },
  spaces: { weather: { pure: true }, plant: { instance: "Plant" } },
  objects: {
    Plant: { label: "a plant (pl)", members: {
      height: { value: "f64", write: true },
      water: { value: "f64", write: true },
      spot: { value: "vec2", write: true },
      age: "f64",
      wilt: { fn: { params: [], returns: "void" }, effects: ["destroy Plant"] },
    } },
    Rng: { label: "the random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Totals: { label: "the garden's totals", members: {} },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { totals: "Totals", $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rain: { params: ["f64"], returns: "f64", space: "weather", may: ["read Totals"] },
    grow: { params: ["Plant", "f64"], returns: "void", space: "plant", may: ["write Plant", "destroy Plant", "bump Totals"] },
    sow: { params: ["Plant", "Rng"], returns: "void", space: "plant", may: ["write Plant.water", "write Plant.spot", "rng"] },
  },
  helpers: { may: ["read Plant"] },
  params: { object: "Params", name: "$" },
  environment(/** @type {Record<string, any>} */ program) {
    const totals = Object.fromEntries(Object.keys(program.total ?? {}).map((n) => [n, { value: "f64", bump: true }]));
    const params = Object.fromEntries(Object.keys(program.param ?? {}).map((n) => [n, "f64"]));
    return { objects: { Totals: { members: totals }, Params: { members: params } } };
  },
});

/** A Grammar over a Dialect made from gardenDef(): totals, params, helpers and the three lambdas. @param {any} dialect */
export const gardenGrammar = (dialect) => defineGrammar(dialect, {
  root: "garden",
  params: { slot: "param" },
  constructs: {
    garden: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })] },
        total: { kind: "decl", args: [name("total")] },
        fn: { kind: "unit", unit: "fn" },
        rain: { kind: "decl", args: [lambda("rain")], once: true },
        grow: { kind: "decl", args: [lambda("grow")], once: true },
        sow: { kind: "decl", args: [lambda("sow")], once: true },
      },
    },
  },
});
