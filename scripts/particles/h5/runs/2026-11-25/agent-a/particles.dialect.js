import { defineDialect, vector, exact } from "kit/define";

const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size"];

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
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "the counters (counters)", members: {} },   // filled per Program: each a total
    Particle: { label: "a particle (p)", members: {
      pos: { value: "vec2", write: true },
      vel: { value: "vec2", write: true },
      age: { value: "f64" },                                         // only the host writes it
      life: { value: "f64", write: true },
      size: { value: "f64", write: true },
      kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
    } },
    Rng: { label: "rng (spawn's random numbers)", call: { params: [], returns: "f64" }, effects: ["rng"] },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: { params: ["vec2"], returns: "f64",
              ref: (v) => Math.hypot(v.x, v.y),
              spell: { js: "Math.hypot($0.x, $0.y)" } },
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
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) {
      if (!BUILTIN_FIELDS.includes(n) && n !== "kill") fields[n] = { value: "f64", write: true };
    }
    const counters = {};
    for (const n of Object.keys(program.counter ?? {})) counters[n] = { value: "f64", bump: true };
    return { objects: {
      Params: { members: params },
      Particle: { members: fields },
      Counters: { members: counters },
    } };
  },
  // state: { t, maxParticles, width, height, emitters: [{ name, live }],
  //          counters: [{ name, value }], particles: [{ x, y }] }, as computed by the host.
  text(state) {
    const lines = [];
    const live = state.particles.length;
    const per = state.emitters.map((e) => `${e.name}=${e.live}`).join(" ");
    lines.push(`t=${state.t.toFixed(2)} live=${live}/${state.maxParticles}${per ? " " + per : ""}`);
    if (state.counters.length) lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { x, y } of state.particles) {
      const c = Math.min(39, Math.max(0, Math.floor((x / state.width) * 40)));
      const r = Math.min(19, Math.max(0, Math.floor((y / state.height) * 20)));
      grid[r][c]++;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
