import { defineDialect, vector, exact } from "kit/define";

const num = { params: ["f64"], returns: "f64" };
const many = { params: ["f64", "f64"], rest: "f64", returns: "f64" };
const NEVER_SEE = "particles never see each other in this language, so there is no collide";

// The text view. `state` is what the host has computed:
// { t, maxParticles, bounds: { width, height },
//   emitters: [{ name, live }],      in declaration order
//   counters: [{ name, value }],     in declaration order
//   particles: [{ x, y }] }          every live particle
function textView(state) {
  const { t, maxParticles, bounds, emitters, counters, particles } = state;
  const header = [`t=${t.toFixed(2)}`, `live=${particles.length}/${maxParticles}`,
    ...emitters.map((e) => `${e.name}=${e.live}`)].join(" ");
  const lines = [header];
  if (counters.length) lines.push(counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
  const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
  for (const { x, y } of particles) {
    const col = Math.max(0, Math.min(39, Math.floor((x / bounds.width) * 40)));
    const row = Math.max(0, Math.min(19, Math.floor((y / bounds.height) * 20)));
    grid[row][col] += 1;
  }
  for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n > 9 ? "#" : String(n))).join(""));
  return lines.join("\n");
}

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  conditions: "bool",
  helpers: { check: "all", may: ["read Particle"] },
  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),
  },
  spaces: {
    system: { pure: true },
    particle: { instance: "Particle" },
  },
  objects: {
    Math: {
      label: "Math",
      members: {
        min: { fn: many },
        max: { fn: many },
        abs: { fn: num },
        sqrt: { fn: num },
        floor: { fn: num },
        sin: { fn: num },
        cos: { fn: num },
        PI: "f64",
      },
      rejected: {
        random: {
          message: "Math.random is not available: randomness comes from spawn's rng, kept in a field if needed later",
          tip: "call rng() in .spawn, store it in a .field, and read that field here",
        },
      },
    },
    Particle: {
      label: "the particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64",
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
      rejected: {
        collide: { message: NEVER_SEE },
      },
    },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "counters", members: {} },
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
    rate: { params: ["f64", "f64"], returns: "f64", space: "system", may: ["read Counters"] },
    spawn: {
      params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "rng", "bump Counters"],
    },
    force: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle.vel"],
    },
    update: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "destroy Particle", "bump Counters"],
    },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) fields[n] = { value: "f64", write: true };
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    return {
      objects: {
        Params: { members: params },
        Particle: { members: fields },
        Counters: { members: counters },
      },
    };
  },
  text: textView,
});
