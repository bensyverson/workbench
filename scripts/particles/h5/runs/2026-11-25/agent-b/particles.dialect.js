import { defineDialect, vector, exact } from "kit/define";

const RESERVED = ["pos", "vel", "age", "life", "size", "kill"];

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: {
    vec2: vector(2, "f64"),
  },
  spaces: {
    rate: { pure: true },
    particle: { instance: "Particle" },
  },
  objects: {
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      abs: { fn: { params: ["f64"], returns: "f64" } },
      sqrt: { fn: { params: ["f64"], returns: "f64" } },
      floor: { fn: { params: ["f64"], returns: "f64" } },
      sin: { fn: { params: ["f64"], returns: "f64" } },
      cos: { fn: { params: ["f64"], returns: "f64" } },
      PI: { value: "f64" },
    } },
    Particle: { label: "a particle (p)", members: {
      pos: { value: "vec2", write: true },
      vel: { value: "vec2", write: true },
      age: { value: "f64" },
      life: { value: "f64", write: true },
      size: { value: "f64", write: true },
      kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
    } },
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "the counters", members: {} },   // filled per Program by environment()
    Params: { label: "the params ($)", members: {} },   // filled per Program by environment()
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: {
      params: ["vec2"], returns: "f64",
      ref: (v) => Math.hypot(v.x, v.y),
      spell: { js: { call: "__plength($0)", prelude: "const __plength = (v) => Math.hypot(v.x, v.y);" } },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
             may: ["write Particle", "rng", "bump Counters"] },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle",
             may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle",
              may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  helpers: { may: ["read Particle"] },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = { value: "f64" };
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) {
      if (!RESERVED.includes(n)) fields[n] = { value: "f64", write: true };
    }
    const counters = {};
    for (const n of Object.keys(program.counter ?? {})) counters[n] = { value: "f64", bump: true };
    return { objects: {
      Params: { members: params },
      Particle: { members: fields },
      Counters: { members: counters },
    } };
  },
  // state: { t, live, maxParticles, emitters: [{ name, live }], counters: [{ name, value }],
  //          width, height, particles: [{ x, y }] } — what the host has computed after a tick.
  text(state) {
    const lines = [];
    const per = (state.emitters ?? []).map((e) => `${e.name}=${e.live}`).join(" ");
    lines.push(`t=${state.t.toFixed(2)} live=${state.live}/${state.maxParticles}${per ? " " + per : ""}`);
    if ((state.counters ?? []).length) {
      lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    }
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const q of state.particles ?? []) {
      const c = Math.min(39, Math.floor((q.x / state.width) * 40));
      const r = Math.min(19, Math.floor((q.y / state.height) * 20));
      if (c >= 0 && r >= 0) grid[r][c]++;
    }
    for (const row of grid) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
