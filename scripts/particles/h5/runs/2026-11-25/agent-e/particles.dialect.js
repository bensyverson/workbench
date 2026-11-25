import { defineDialect, vector, exact } from "kit/define";

// Dialect: what a particles lambda means.
//
// text(state) takes a plain object the host builds each tick:
//   { t, maxParticles, emitters: [{ name, live }], counters: [[name, value]],
//     particles: [{ x, y }], bounds: { width, height } }

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: {
    vec2: vector(2, "f64"),
  },
  // emit: rate lambdas (pure, read counters). particle: instance space, one Particle per lambda.
  spaces: {
    emit: { pure: true },
    particle: { instance: "Particle" },
  },
  objects: {
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
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "counters", members: {} },        // filled per Program by environment()
    Params: { label: "the params ($)", members: {} },    // filled per Program by environment()
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
        PI: "f64",
      },
    },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: (v) => Math.hypot(v.x, v.y),
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(v.x, v.y);" } },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // rate: pure; reads counters; returns particles per second
    rate: { params: ["f64", "f64"], returns: "f64", space: "emit", may: ["read Counters"] },
    // spawn: the newborn, its rng, and its index; writes fields, draws rng, bumps counters
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
             may: ["write Particle", "rng", "bump Counters"] },
    // force: writes only vel
    force: { params: ["Particle", "f64"], returns: "void", space: "particle",
             may: ["write Particle.vel"] },
    // update: writes fields, may kill, bumps counters
    update: { params: ["Particle", "f64"], returns: "void", space: "particle",
              may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) fields[n] = { value: "f64", write: true };
    const counters = {};
    for (const n of Object.keys(program.counter ?? {})) counters[n] = { value: "f64", bump: true };
    return {
      objects: {
        Params: { members: params },
        Particle: { members: fields },
        Counters: { members: counters },
      },
    };
  },
  text(state) {
    const lines = [];
    const em = state.emitters.map((e) => `${e.name}=${e.live}`).join(" ");
    lines.push(`t=${state.t.toFixed(2)} live=${state.particles.length}/${state.maxParticles}${em ? " " + em : ""}`);
    if (state.counters.length) lines.push(state.counters.map(([n, v]) => `${n}=${v}`).join(" "));
    const COLS = 40, ROWS = 20;
    const cells = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (const p of state.particles) {
      const c = Math.min(COLS - 1, Math.floor((p.x / state.bounds.width) * COLS));
      const r = Math.min(ROWS - 1, Math.floor((p.y / state.bounds.height) * ROWS));
      if (c >= 0 && r >= 0) cells[r][c]++;
    }
    for (const row of cells) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
