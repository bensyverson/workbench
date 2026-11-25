// The checker's passing fixture for --effects: the packet's garden (api-effects.md), shaped as rules-effects.md's
// hand-in (the file names are garden's, not particles'). Plants grow and are sown in an instance space; the
// weather's rain rate is pure and reads the totals that grow bumps.
import { defineDialect, vector, exact } from "kit/define";

export const garden = defineDialect({
  name: "garden",
  numberType: "f64",
  text: (state) => JSON.stringify(state),
  types: { vec2: vector(2, "f64") },
  spaces: {
    weather: { pure: true },
    plant: { instance: "Plant" },
  },
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
    Math: { label: "Math", members: { max: { fn: { params: ["f64", "f64"], returns: "f64" } } } },
  },
  globals: { totals: "Totals", $: "Params", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rain: { params: ["f64"], returns: "f64", space: "weather", may: ["read Totals"] },
    grow: { params: ["Plant", "f64"], returns: "void", space: "plant", may: ["write Plant", "destroy Plant", "bump Totals"] },
    sow: { params: ["Plant", "Rng"], returns: "void", space: "plant", may: ["write Plant.water", "write Plant.spot", "rng"] },
  },
  helpers: { may: ["read Plant"] },
  params: { object: "Params", name: "$" },
  environment(program) {
    const totals = Object.fromEntries(Object.keys(program.total ?? {}).map((n) => [n, { value: "f64", bump: true }]));
    const params = Object.fromEntries(Object.keys(program.param ?? {}).map((n) => [n, "f64"]));
    return { objects: { Totals: { members: totals }, Params: { members: params } } };
  },
});
