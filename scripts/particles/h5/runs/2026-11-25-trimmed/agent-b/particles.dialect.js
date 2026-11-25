import { defineDialect, vector, object, exact } from "kit/define";

const fn1 = { fn: { params: ["f64"], returns: "f64" } };
const fnN = { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } };

const NO_COLLIDE = {
  message: "particles never see each other in this language, so there is no collide",
  tip: "remove collide; shape motion with forces and update",
};

/** The fields every particle has; a `.field` may not repeat them (nor `kill`). */
export const BUILT_IN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

const WIDE = 40;
const HIGH = 20;

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64", { multiply: "scalar" }) },
  conditions: "bool",
  spaces: { pure: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Math: {
      label: "Math",
      members: {
        min: fnN, max: fnN, abs: fn1, sqrt: fn1, floor: fn1, sin: fn1, cos: fn1, PI: "f64",
      },
      rejected: {
        random: {
          message: "Math.random is not available: randomness comes from spawn's rng",
          tip: "call rng() in spawn, and keep the number in a field if update needs it later",
        },
        tan: { message: "Math.tan is not in this language", tip: "use Math.sin(a) / Math.cos(a)" },
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
      rejected: { collide: NO_COLLIDE },
    },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "the counters", members: {} },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { Math: "Math", counters: "Counters", $: "Params" },
  intrinsics: {
    length: {
      params: ["vec2"],
      returns: "f64",
      ref: Math.hypot,
      spell: { js: "Math.hypot($0[0], $0[1])" },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  helpers: { check: "all", may: ["read Particle"] },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "pure", may: ["read Counters"] },
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
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) {
      if (!BUILT_IN_FIELDS.includes(n) && n !== "collide") fields[n] = { value: "f64", write: true };
    }
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
  // state: the host's computed state after a tick:
  //   { t, maxParticles, bounds: { width, height },
  //     emitters: [{ name, live }],            // declaration order
  //     counters: [{ name, value }],           // declaration order
  //     particles: [{ x, y }] }                // every live particle
  text(state) {
    const live = state.emitters.reduce((sum, e) => sum + e.live, 0);
    const lines = [
      [`t=${state.t.toFixed(2)}`, `live=${live}/${state.maxParticles}`,
        ...state.emitters.map((e) => `${e.name}=${e.live}`)].join(" "),
    ];
    if (state.counters.length > 0) {
      lines.push(state.counters.map((c) => `${c.name}=${c.value}`).join(" "));
    }
    const cells = Array.from({ length: HIGH }, () => new Array(WIDE).fill(0));
    for (const { x, y } of state.particles) {
      const col = Math.max(0, Math.min(WIDE - 1, Math.floor((x / state.bounds.width) * WIDE)));
      const row = Math.max(0, Math.min(HIGH - 1, Math.floor((y / state.bounds.height) * HIGH)));
      cells[row][col] += 1;
    }
    for (const row of cells) {
      lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    }
    return lines.join("\n");
  },
});
