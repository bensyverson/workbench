// Particles Dialect: what a particle program means.
//
// Text view state (what `text` prints), as the host computes it:
//   { t, live, maxParticles, bounds: { width, height },
//     emitters: [{ name, live }],            // declaration order
//     counters: [{ name, value }],           // declaration order; [] when none
//     particles: [{ x, y }] }                // every live particle's pos

import {
  defineDialect, vector, exact,
} from "kit/define";

// The particle's built-in members. `environment` adds the program's fields.
const PARTICLE_BASE = {
  pos: { value: "vec2", write: true },
  vel: { value: "vec2", write: true },
  age: { value: "f64" },                      // read-only: only the host writes it
  life: { value: "f64", write: true },
  size: { value: "f64", write: true },
  kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
};

const PARTICLE_REJECTED = {
  collide: {
    message: "particles never see each other, so there is no collide(); a particle's behaviour can use only its own fields",
    fix: "p.vel = … (write the force in a .force(…) lambda, or the particle's own field in .update(…))",
  },
};

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",

  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),   // vector * vector is refused
  },

  spaces: {
    pure: { pure: true },                       // rate, helpers' callers
    particle: { instance: "Particle" },         // spawn, force, update: one particle, changed only through its slot's `may`
  },

  objects: {
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
        random: {
          message: "randomness comes from spawn's rng, not Math.random: call rng() inside a .spawn(…) lambda",
          fix: "rng()   (spawn's second parameter; keep the result in a field if update needs it later)",
        },
      },
    },
    Params: { label: "the params ($)", members: {} },   // filled per Program by environment()
    Counters: { label: "the counters (counters)", members: {} },   // filled per Program by environment()
    Particle: { label: "a particle (p)", members: PARTICLE_BASE, rejected: PARTICLE_REJECTED },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
  },

  globals: { Math: "Math", $: "Params", counters: "Counters" },

  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: Math.hypot,                          // a ref gets the components spread
      spell: { js: { call: "Math.hypot(...$0)" } },
    },
  },

  library: {},

  targets: { js: { accepts: "*", compare: exact() } },

  slots: {
    // rate: a pure number function. Reads counters, writes nothing.
    rate: { params: ["f64", "f64"], returns: "f64", space: "pure", may: ["read Counters"] },
    // spawn: one newborn particle, an rng, and its index. Writes its fields (not age), draws rng, bumps counters.
    spawn: {
      params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
      may: ["write Particle", "rng", "bump Counters"], body: "block",
    },
    // force: one particle and dt. Writes only vel.
    force: {
      params: ["Particle", "f64"], returns: "void", space: "particle",
      may: ["write Particle.vel"], body: "block",
    },
    // update: one particle and dt. Writes fields, may kill, bumps counters.
    update: {
      params: ["Particle", "f64"], returns: "void", space: "particle",
      may: ["write Particle", "destroy Particle", "bump Counters"], body: "block",
    },
  },

  helpers: { check: "all" },                    // every top-level function is checked, called or not


  params: { object: "Params", name: "$" },

  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";

    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };

    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) fields[n] = { value: "f64", write: true };

    return {
      objects: {
        Params: { members: params },
        Counters: { members: counters },
        Particle: { members: fields },          // additive: the base members are not repeated (D007)
      },
    };
  },

  // The host's screen as characters: a header, counters, then a 40 x 20 grid.
  text(state) {
    const head = [`t=${state.t.toFixed(2)}`, `live=${state.live}/${state.maxParticles}`];
    for (const e of state.emitters) head.push(`${e.name}=${e.live}`);
    const lines = [head.join(" ")];
    for (const c of state.counters) lines.push(`${c.name}=${c.value}`);

    const grid = [];
    for (let r = 0; r < 20; r++) grid.push(Array(40).fill("."));
    const counts = grid.map((row) => row.map(() => 0));
    for (const p of state.particles) {
      const col = Math.min(39, Math.floor(p.x / state.bounds.width * 40));
      const row = Math.min(19, Math.floor(p.y / state.bounds.height * 20));
      counts[row][col] += 1;
    }
    for (let r = 0; r < 20; r++) {
      let s = "";
      for (let c = 0; c < 40; c++) {
        const n = counts[r][c];
        s += n === 0 ? "." : n >= 10 ? "#" : String(n);
      }
      lines.push(s);
    }
    return lines.join("\n");
  },
});
