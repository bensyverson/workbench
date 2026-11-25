import { defineDialect, vector, exact } from "kit/define";

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64") },
  // rate is pure; the other three lambdas are handed one Particle and may change only it.
  spaces: { rate: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64", // read-only: only the host writes it
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
        // environment(program) adds one writable number per .field
      },
    },
    Rng: { label: "the random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "the counters", members: {} }, // environment adds one total per .counter
    Params: { label: "the params ($)", members: {} },
    Math: {
      label: "Math",
      members: {
        PI: "f64",
        min: { fn: { params: ["f64", "f64"], returns: "f64", rest: "f64" } },
        max: { fn: { params: ["f64", "f64"], returns: "f64", rest: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
        sqrt: { fn: { params: ["f64"], returns: "f64" } },
        floor: { fn: { params: ["f64"], returns: "f64" } },
        sin: { fn: { params: ["f64"], returns: "f64" } },
        cos: { fn: { params: ["f64"], returns: "f64" } },
      },
    },
  },
  globals: { $: "Params", counters: "Counters", Math: "Math" },
  intrinsics: {
    length: {
      params: ["T"], returns: "f64", numeric: "vector", ref: Math.hypot,
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(...v);" } },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", may: ["write Particle", "rng", "bump Counters"] },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  params: { object: "Params", name: "$" },

  environment(program) {
    const particle = {};
    for (const n of Object.keys(program.fields ?? {})) particle[n] = { value: "f64", write: true };
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    return { objects: { Particle: { members: particle }, Counters: { members: counters }, Params: { members: params } } };
  },

  // state: { t, maxParticles, width, height, counters: [{ name, value }],
  //   emitters: [{ name, live }] in declaration order, particles: [{ x, y }] }
  text(state) {
    const total = state.emitters.reduce((a, e) => a + e.live, 0);
    const lines = [`t=${state.t.toFixed(2)} live=${total}/${state.maxParticles} ` + state.emitters.map((e) => `${e.name}=${e.live}`).join(" ")];
    if (state.counters.length) lines.push(state.counters.map((c) => `${c.name}=${c.value}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const q of state.particles) {
      const c = Math.min(39, Math.floor((q.x / state.width) * 40));
      const r = Math.min(19, Math.floor((q.y / state.height) * 20));
      grid[r][c]++;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
