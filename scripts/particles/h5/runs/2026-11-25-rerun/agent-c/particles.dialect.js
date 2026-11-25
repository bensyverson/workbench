import { defineDialect, vector, exact } from "kit/define";

const num1 = { fn: { params: ["f64"], returns: "f64" } };
const num2 = { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } };

const NO_COLLIDE = {
  message: "particles never see each other in this language, so there is no collide",
  fix: "forces and update, which act on one particle at a time",
};

const BUILT_IN_FIELDS = {
  pos: { value: "vec2", write: true },
  vel: { value: "vec2", write: true },
  age: "f64",
  life: { value: "f64", write: true },
  size: { value: "f64", write: true },
  kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
};

// The text view's size in characters.
const COLS = 40;
const ROWS = 20;

// state: { t, maxParticles, width, height,
//          emitters: [{ name, live }] (declaration order),
//          counters: [{ name, value }] (declaration order),
//          particles: [{ x, y }] (every live particle) }
function text(state) {
  const live = state.particles.length;
  const header = [`t=${state.t.toFixed(2)}`, `live=${live}/${state.maxParticles}`]
    .concat(state.emitters.map((e) => `${e.name}=${e.live}`))
    .join(" ");
  const lines = [header];
  if (state.counters.length > 0) lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (const p of state.particles) {
    const col = Math.max(0, Math.min(COLS - 1, Math.floor((p.x / state.width) * COLS)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor((p.y / state.height) * ROWS)));
    grid[row][col] += 1;
  }
  for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n < 10 ? String(n) : "#")).join(""));
  return lines.join("\n");
}

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  conditions: "bool",
  types: { vec2: vector(2, "f64", { multiply: "scalar" }) },
  spaces: { rate: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Math: {
      label: "Math",
      members: { min: num2, max: num2, abs: num1, sqrt: num1, floor: num1, sin: num1, cos: num1, PI: "f64" },
      rejected: {
        random: {
          message: "Math.random is not part of the language: randomness comes from spawn's rng, kept in a field if needed later",
          fix: "rng() in spawn, stored in a .field",
        },
      },
    },
    Particle: { label: "a particle (p)", members: BUILT_IN_FIELDS, rejected: { collide: NO_COLLIDE } },
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "the counters", members: {} },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: Math.hypot,
      spell: { js: "Math.hypot($0[0], $0[1])" },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: {
      params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "rng", "bump Counters"],
    },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle.vel"] },
    update: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "destroy Particle", "bump Counters"],
    },
  },
  helpers: { may: ["read Particle"], check: "all" },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) {
      if (!Object.hasOwn(BUILT_IN_FIELDS, n)) fields[n] = { value: "f64", write: true };
    }
    const counters = {};
    for (const n of Object.keys(program.counter ?? {})) counters[n] = { value: "f64", bump: true };
    return { objects: { Params: { members: params }, Particle: { members: fields }, Counters: { members: counters } } };
  },
  text,
});
