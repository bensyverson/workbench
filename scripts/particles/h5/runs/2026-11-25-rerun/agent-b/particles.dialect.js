import { defineDialect, vector, exact } from "kit/define";

// Built-in particle fields, and the names no .field may take.
export const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

const RNG_MSG = "randomness comes only from spawn's rng(); draw it in spawn and keep it in a field if a later lambda needs it";

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  conditions: "bool",
  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),
  },
  spaces: {
    rate: { pure: true },
    particle: { instance: "Particle" },
  },
  objects: {
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: { value: "f64" },
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
      rejected: {
        collide: { message: "particles never see each other in this language: there is no collide", fix: "p.vel = p.vel * 0.5;" },
      },
    },
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Math: {
      label: "Math",
      members: {
        min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
        sqrt: { fn: { params: ["f64"], returns: "f64" } },
        floor: { fn: { params: ["f64"], returns: "f64" } },
        sin: { fn: { params: ["f64"], returns: "f64" } },
        cos: { fn: { params: ["f64"], returns: "f64" } },
        PI: { value: "f64" },
      },
      rejected: {
        random: { message: RNG_MSG, fix: "rng()" },
        tan: { message: "Math.tan is not in this language; it has Math.sin and Math.cos", fix: "Math.sin(a) / Math.cos(a)" },
      },
    },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "the counters", members: {} },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: {
      params: ["vec2"], returns: "f64",
      ref: Math.hypot,
      spell: { js: "Math.hypot($0[0], $0[1])" },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block",
             may: ["write Particle", "rng", "bump Counters"] },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
             may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
              may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  helpers: { may: ["read Particle"], check: "all" },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) {
      if (!BUILTIN_FIELDS.includes(n)) fields[n] = { value: "f64", write: true };
    }
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    return { objects: { Params: { members: params }, Particle: { members: fields }, Counters: { members: counters } } };
  },
  // state: { t, maxParticles, width, height,
  //          emitters: [{ name, live }], counters: [{ name, value }], particles: [{ x, y }] }
  text(state) {
    const live = state.particles.length;
    const lines = [];
    lines.push(`t=${state.t.toFixed(2)} live=${live}/${state.maxParticles}` +
      state.emitters.map((e) => ` ${e.name}=${e.live}`).join(""));
    if (state.counters.length) lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { x, y } of state.particles) {
      const c = Math.max(0, Math.min(39, Math.floor((x / state.width) * 40)));
      const r = Math.max(0, Math.min(19, Math.floor((y / state.height) * 20)));
      grid[r][c]++;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
