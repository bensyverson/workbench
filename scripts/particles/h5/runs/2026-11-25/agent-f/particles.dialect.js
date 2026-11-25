import { defineDialect, vector, exact } from "kit/define";

// The particles Dialect: what a lambda means.
//
// text(state): `state` is the host's computed frame:
//   { t, maxParticles, live, bounds: { width, height },
//     emitters: [{ name, live }], counters: [{ name, value }],
//     particles: [{ x, y }] }
// It prints the header, the counter line (if any) and the 40x20 grid.

export const particlesLang = defineDialect({
  name: "particles",
  numberType: "f64",

  types: {
    vec2: vector(2, "f64"),
  },

  // pure: rate. particle: the instance space of spawn, force and update,
  // each of which gets one Particle and may change only what its `may` lists.
  spaces: {
    pure: { pure: true },
    particle: { instance: "Particle" },
  },

  objects: {
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: { value: "f64" },                  // read-only: only the host writes it
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
        // each .field(name) is added per Program by environment()
      },
    },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "counters", members: {} },   // .counter(name) added by environment()
    Params: { label: "the params ($)", members: {} }, // .param(name) added by environment()
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
    },
  },

  globals: { Math: "Math", $: "Params", counters: "Counters" },

  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: (v) => Math.hypot(v.x, v.y),
      spell: { js: { call: "particlesLength($0)", prelude: "const particlesLength = (v) => Math.hypot(v.x, v.y);" } },
    },
  },

  targets: { js: { accepts: "*", compare: exact() } },

  slots: {
    // rate(t, live) -> particles per second. Pure: reads counters only.
    rate: { params: ["f64", "f64"], returns: "f64", space: "pure", may: ["read Counters"] },
    // spawn(p, rng, i): sets the newborn's fields, draws randomness, bumps counters.
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
             may: ["rng", "write Particle", "bump Counters"] },
    // force(p, dt): changes only vel.
    force: { params: ["Particle", "f64"], returns: "void", space: "particle",
             may: ["write Particle.vel"] },
    // update(p, dt): sets fields, may kill, bumps counters.
    update: { params: ["Particle", "f64"], returns: "void", space: "particle",
              may: ["write Particle", "destroy Particle", "bump Counters"] },
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

  text(state) {
    const W = 40, H = 20;
    const header = [`t=${state.t.toFixed(2)}`, `live=${state.live}/${state.maxParticles}`,
      ...state.emitters.map((e) => `${e.name}=${e.live}`)].join(" ");
    const lines = [header];
    if (state.counters.length) lines.push(state.counters.map((c) => `${c.name}=${c.value}`).join(" "));
    const grid = Array.from({ length: H }, () => Array(W).fill(0));
    for (const p of state.particles) {
      const col = Math.min(W - 1, Math.floor((p.x / state.bounds.width) * W));
      const row = Math.min(H - 1, Math.floor((p.y / state.bounds.height) * H));
      grid[row][col]++;
    }
    for (const row of grid) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
