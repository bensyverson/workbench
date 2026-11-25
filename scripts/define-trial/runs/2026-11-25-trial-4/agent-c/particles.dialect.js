import { defineDialect, vector, exact } from "kit/define";

// The particles Dialect: one Particle per instance space, the host's counters and
// params, and the four Runtime Lambda kinds of dream-code.md.
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
    // Fields are added per Program by environment(program); pos, vel, age, life and size are fixed here.
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64",
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
    },
    // The host's seeded random stream: rng() in a spawn lambda.
    Rng: { label: "the random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    // One total per counter, added by environment(program).
    Counters: { label: "the counters (counters)", members: {} },
    // One read-only number per param, added by environment(program).
    Params: { label: "the params ($)", members: {} },
    Math: {
      label: "the Math functions (Math)",
      members: {
        PI: "f64",
        min: { fn: { params: ["f64", "f64"], returns: "f64" } },
        max: { fn: { params: ["f64", "f64"], returns: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
        sqrt: { fn: { params: ["f64"], returns: "f64" } },
        floor: { fn: { params: ["f64"], returns: "f64" } },
        sin: { fn: { params: ["f64"], returns: "f64" } },
        cos: { fn: { params: ["f64"], returns: "f64" } },
      },
    },
  },
  globals: {
    Math: "Math",
    counters: "Counters",
    $: "Params",
  },
  intrinsics: {
    length: {
      params: ["vec2"], returns: "f64",
      ref: (v) => Math.hypot(...v),
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(...v);" } },
    },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    // Pure: reads only. The counters may be read here, never bumped.
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
             may: ["write Particle", "rng", "bump Counters"] },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle",
             may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle",
              may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const fields = {};
    for (const name of Object.keys(program.field ?? {})) fields[name] = { value: "f64", write: true };
    const params = {};
    for (const name of Object.keys(program.params ?? {})) params[name] = "f64";
    const counters = {};
    for (const name of Object.keys(program.counter ?? {})) counters[name] = { value: "f64", bump: true };
    return { objects: { Particle: { members: fields }, Params: { members: params }, Counters: { members: counters } } };
  },
  // The host's state: { t, bounds: { width, height }, maxParticles, emitters: [{ name, live }],
  // counters: { name: value } in declaration order, particles: [{ x, y }] }.
  text(state) {
    const cols = 40;
    const rows = 20;
    const { width, height } = state.bounds;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (const p of state.particles) {
      const c = Math.min(cols - 1, Math.floor((p.x / width) * cols));
      const r = Math.min(rows - 1, Math.floor((p.y / height) * rows));
      grid[r][c] += 1;
    }
    const cell = (n) => (n === 0 ? "." : n >= 10 ? "#" : String(n));
    const emitters = state.emitters.map((e) => `${e.name}=${e.live}`).join(" ");
    const lines = [`t=${state.t.toFixed(2)} live=${state.particles.length}/${state.maxParticles} ${emitters}`];
    for (const [k, v] of Object.entries(state.counters)) lines.push(`${k}=${v}`);
    for (const row of grid) lines.push(row.map(cell).join(""));
    return lines.join("\n");
  },
});
