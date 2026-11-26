import { defineDialect, vector, exact } from "kit/define";

export const particlesLang = defineDialect({
  name: "particles",
  numberType: "f64",
  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),
  },
  spaces: {
    rate: { pure: true },
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
        PI: { value: "f64" },
      },
      rejected: {
        random: {
          message: "there is no Math.random in a particles lambda: randomness comes only from spawn's rng(), kept in a field if update needs it later (19)",
          tip: "draw the number in spawn with rng() and keep it in a field (say .field(\"r\", { value: 0 }), p.r = rng()) if update needs it later",
        },
        tan: {
          message: "Math.tan is not a particles built-in; only Math.min, max, abs, sqrt, floor, sin, cos and PI exist (19)",
          fix: "Math.sin(a) / Math.cos(a)",
        },
      },
    },
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
      rejected: {
        collide: {
          message: "particles never see each other in this language: there is no collide (20)",
          tip: "remove the collide call: particles do not interact",
        },
      },
    },
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "the counters", members: {} },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: Math.hypot,
      spell: { js: "Math.hypot($0[0], $0[1])" },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: {
      params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "rng", "bump Counters"],
    },
    force: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle.vel"],
    },
    update: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "destroy Particle", "bump Counters"],
    },
  },
  helpers: { may: ["read Particle"], check: "all" },
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
  // state: what the host has computed for one moment:
  // { t, maxParticles, width, height,
  //   emitters: [{ name, live }],            // in declaration order
  //   counters: [{ name, value }],           // in declaration order
  //   particles: [{ x, y }] }                // every live particle
  text(state) {
    const live = state.particles.length;
    const lines = [];
    lines.push(
      [`t=${state.t.toFixed(2)}`, `live=${live}/${state.maxParticles}`,
       ...state.emitters.map((e) => `${e.name}=${e.live}`)].join(" "),
    );
    if (state.counters.length > 0) {
      lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    }
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { x, y } of state.particles) {
      const col = Math.min(39, Math.max(0, Math.floor((x / state.width) * 40)));
      const row = Math.min(19, Math.max(0, Math.floor((y / state.height) * 20)));
      grid[row][col]++;
    }
    for (const row of grid) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
