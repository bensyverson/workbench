import { defineDialect, vector, exact } from "kit/define";

// What the host passes to text(state) (our choice; dream-code.md does not name the shape):
//   { t, maxParticles, live, emitters: [{ name, live }], counters: [{ name, value }],
//     bounds: { width, height }, particles: [{ x, y }] }
export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  conditions: "bool",

  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),
  },

  // "pure": rate lambdas. "particle": one Particle per lambda call (forces, spawn, update).
  spaces: {
    pure: { pure: true },
    particle: { instance: "Particle" },
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
        PI: "f64",
      },
      rejected: {
        random: {
          message: "Math.random is not in this language: randomness comes from spawn's rng",
          tip: "call rng() inside spawn and keep the number in a field if a later lambda needs it",
        },
      },
    },
    Params: { label: "the params ($)", members: {} },   // filled per Program by environment()
    Counters: { label: "the counters", members: {} },   // filled per Program by environment()
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64",                                  // read-only: only the host writes it
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language: there is no collide()",
          tip: "give each particle its own motion in forces and update",
        },
      },
    },
  },

  globals: { Math: "Math", $: "Params", counters: "Counters" },

  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: Math.hypot,
      spell: { js: "Math.hypot(...$0)" },
    },
  },

  targets: { js: { accepts: "*", compare: exact() } },

  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "pure", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle",
             may: ["write Particle", "rng", "bump Counters"], body: "block" },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle",
             may: ["write Particle.vel"], body: "block" },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle",
              may: ["write Particle", "destroy Particle", "bump Counters"], body: "block" },
  },

  helpers: { check: "all" },

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
    const lines = [];
    const per = state.emitters.map((e) => ` ${e.name}=${e.live}`).join("");
    lines.push(`t=${state.t.toFixed(2)} live=${state.live}/${state.maxParticles}${per}`);
    for (const c of state.counters) lines.push(`${c.name}=${c.value}`);
    const COLS = 40, ROWS = 20;
    const grid = [];
    for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));
    for (const p of state.particles) {
      const c = Math.min(COLS - 1, Math.max(0, Math.floor((p.x / state.bounds.width) * COLS)));
      const r = Math.min(ROWS - 1, Math.max(0, Math.floor((p.y / state.bounds.height) * ROWS)));
      grid[r][c]++;
    }
    for (const row of grid) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
