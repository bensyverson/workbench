import { defineDialect, vector, exact } from "kit/define";

// Dialect for the particles language (dream-code.md).
//
// Particle lambdas get one Particle (an instance space) and may change only
// what their slot's `may` allows. Rate lambdas are pure and may read counters.
// Counters are totals: spawn and update may bump them; rate may read them.

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",

  types: {
    Vec2: vector(2, "f64", { multiply: "scalar" }),
  },

  spaces: {
    pure: { pure: true },
    spawn: { instance: "Particle" },
    force: { instance: "Particle" },
    update: { instance: "Particle" },
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
          message: "Math.random is not in the language: randomness comes from spawn's rng, kept in a field if update needs it later",
          fix: "rng()",
        },
        tan: {
          message: "Math.tan is not in the language; only Math.min, max, abs, sqrt, floor, sin, cos and PI are",
          fix: "Math.sin(x) / Math.cos(x)",
        },
      },
    },

    // The particle a force, spawn or update lambda is handed. Environment adds
    // the Program's fields as writable members.
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "Vec2", write: true },
        vel: { value: "Vec2", write: true },
        age: { value: "f64" },                       // read-only: only the host writes age
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language, so there is no collide",
          fix: "emitter(...).spawn((p, rng) => { ... })",
        },
      },
    },

    // rng() in spawn: a number in [0, 1).
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },

    // counters: totals. environment adds one per declared counter.
    Counters: { label: "counters", members: {} },

    // $: the Program's params. environment adds one per declared param.
    Params: { label: "the params ($)", members: {} },
  },

  globals: { Math: "Math", $: "Params", counters: "Counters" },

  intrinsics: {
    vec2: {
      params: ["f64", "f64"],
      returns: "Vec2",
      ref: (x, y) => [x, y],
      spell: { js: "[$0, $1]" },
    },
    length: {
      params: ["Vec2"],
      returns: "f64",
      ref: Math.hypot,                               // components are spread in
      spell: { js: "Math.hypot(...$0)" },
    },
  },

  targets: { js: { accepts: "*", compare: exact() } },

  // Helpers are pure: they read particles passed to them, and nothing else.
  helpers: { check: "all", may: ["read Particle"] },

  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "pure", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "spawn",
             may: ["write Particle", "bump Counters", "rng"], body: "block" },
    force: { params: ["Particle", "f64"], returns: "void", space: "force",
             may: ["write Particle.vel"], body: "block" },
    update: { params: ["Particle", "f64"], returns: "void", space: "update",
              may: ["write Particle", "destroy Particle", "bump Counters"], body: "block" },
  },

  params: { object: "Params", name: "$" },

  environment(program) {
    // Members are added by name; the base Particle members above stay.
    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) fields[n] = { value: "f64", write: true };
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    return {
      objects: {
        Particle: { members: fields },
        Counters: { members: counters },
        Params: { members: params },
      },
    };
  },

  // The text view. `state` is what the host computes for one tick:
  //   { t, maxParticles, bounds: { width, height },
  //     emitters: [{ name, live }],           // declaration order
  //     counters: [{ name, value }],          // declaration order
  //     particles: [{ x, y }] }               // alive particles
  text(state) {
    const { t, maxParticles, bounds, emitters, counters, particles } = state;
    const live = particles.length;
    const lines = [];
    const per = emitters.map((e) => `${e.name}=${e.live}`).join(" ");
    lines.push(`t=${t.toFixed(2)} live=${live}/${maxParticles}${per ? " " + per : ""}`);
    if (counters.length) lines.push(counters.map((c) => `${c.name}=${c.value}`).join(" "));
    const W = 40, H = 20;
    const cells = Array.from({ length: H }, () => Array(W).fill("."));
    const count = Array.from({ length: H }, () => Array(W).fill(0));
    for (const p of particles) {
      const col = Math.min(W - 1, Math.floor((p.x / bounds.width) * W));
      const row = Math.min(H - 1, Math.floor((p.y / bounds.height) * H));
      count[row][col] += 1;
    }
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const n = count[r][c];
        cells[r][c] = n === 0 ? "." : n >= 10 ? "#" : String(n);
      }
    for (const row of cells) lines.push(row.join(""));
    return lines.join("\n");
  },
});
