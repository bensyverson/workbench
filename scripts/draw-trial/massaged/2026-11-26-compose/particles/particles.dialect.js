import { defineDialect, vector, exact, list, struct } from "kit/define";

// The particle's built-in fields; a .field may not take one of these names (or "kill").
export const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

// The picture: a particle's color says how much of its life is gone, by thirds.
const tint = (p) => (p.age * 3 < p.life ? "young" : p.age * 3 < p.life * 2 ? "middle" : "old");
const radius = (p) => Math.max(0, p.size) / 2;

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  // Sheet: every condition is a boolean; vectors multiply by a number only.
  types: {
    vec2: vector(2, "f64", { multiply: "scalar" }),
  },
  spaces: {
    // rate runs once per emitter per tick and changes nothing.
    emitter: { pure: true },
    // spawn, force and update are each handed one particle and may change that particle only.
    particle: { instance: "Particle" },
  },
  objects: {
    Particle: {
      label: "the particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64", // only the runtime writes it
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
        // environment(program) adds one { value: "f64", write: true } per .field
      },
      rejected: { collide: { message: "particles never see each other in this language", tip: "keep what a particle needs in its own fields; there is no collision" } },
    },
    Rng: { label: "spawn's random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    // environment(program) adds one { value: "f64", bump: true } per .counter
    Counters: { label: "the counters (counters)", members: {} },
    // environment(program) adds one f64 per .param
    Params: { label: "the params ($)", members: {} },
    // the kit fills it with one member per value input (ports.in)
    In: { label: "the inputs (inp)", members: {} },
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
      rejected: { random: { message: "Math.random is not reproducible; the seeded stream is spawn's rng", fix: "rng() inside a spawn lambda" } },
    },
  },
  globals: { $: "Params", counters: "Counters", Math: "Math", inp: "In" },
  intrinsics: {
    length: {
      params: ["vec2"], returns: "f64",
      ref: (x, y) => Math.hypot(x, y),
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(...v);" } },
    },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "emitter", may: ["read Counters"] },
    spawn: {
      params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "rng", "bump Counters"],
    },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle.vel"] },
    update: {
      params: ["Particle", "f64"], returns: "void", space: "particle", body: "block",
      may: ["write Particle", "destroy Particle", "bump Counters"],
    },
  },
  // Helpers are pure: they may read the particle they are passed, and nothing that changes otherwise. Every one is
  // checked, called or not (the sheet says so); what an uncalled one does through a parameter cannot be seen.
  helpers: { may: ["read Particle"], check: "all" },
  // the picture's builder is Bench code: it calls tint and radius as Library functions, not the file's closures
  library: { tint: { fn: String(tint) }, radius: { fn: String(radius) } },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    const state = {};
    for (const n of Object.keys(program.fields ?? {})) {
      if (!BUILTIN_FIELDS.includes(n)) { fields[n] = { value: "f64", write: true }; state[n] = "f64"; }
    }
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    return {
      objects: {
        Params: { members: params },
        Particle: { members: fields },
        Counters: { members: counters },
      },
      // each .field is also a field of every particle's state, so its value lasts from tick to tick
      state,
    };
  },
  // The run's state: what the runtime computes after each tick, and hands text(state) and the UI's views. Each
  // particle keeps what its next tick needs: its velocity, age, life and size, the emitter that made it (whose
  // forces it feels) and its .field values, by name: environment(program) adds one f64 per .field to `fields`.
  state: {
    t: "f64",
    maxParticles: "f64",
    bounds: struct({ width: "f64", height: "f64" }),
    particles: list(struct({ x: "f64", y: "f64", vx: "f64", vy: "f64", age: "f64", life: "f64", size: "f64", emitter: "str", fields: struct({}, { extensible: true }) }), 10000),
    emitters: list(struct({ name: "str", live: "f64" }), 100),
    counters: list(struct({ name: "str", value: "f64" }), 100),
  },
  // Pixels of the box: x to the right, y down, (0, 0) its top-left corner.
  frames: {
    px: {
      dims: 2,
      note: "pixels of the particles' box; x to the right, y down; (0, 0) is the box's top-left corner and (width, height) its bottom-right",
      extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] }),
    },
  },
  // The picture's own colors; on a wire each crosses as the color it names.
  colors: {
    young: "#fff1a8",
    middle: "#ff9a2e",
    old: "#c2362bb0",
  },
  ports: {
    out: {
      view: {
        seam: "Draw<10000>@px",
        max: (record) => record.maxParticles,
        note: "the live particles after each step, in px: one filled ellipse each, centered on the particle, its diameter the particle's size in pixels, colored by the part of its life gone (first third pale yellow, second orange, last translucent red); nothing else is drawn, no background or box, so it can lie over another picture",
        pen: (s, pen) => {
          for (const p of s.particles) pen.ellipse({ at: [p.x, p.y], r: [radius(p), radius(p)], fill: tint(p) });
        },
      },
    },
    in: {
      burst: {
        seam: "Event<{ at: point2@px }>",
        note: "each record makes every emitter whose trigger is this input spawn its perEvent particles at the record's position; spawn lambdas read the record as ev (ev.at)",
        record: { name: "ev", slots: ["spawn"] },
      },
      speed: { seam: "f64@px/s", default: 120, note: "a speed in pixels per second that spawn lambdas may read as inp.speed, to scale how fast particles fly" },
    },
  },
  inputs: { object: "In", name: "inp" },
  text(state) {
    const head = `t=${state.t.toFixed(2)} live=${state.particles.length}/${state.maxParticles} ` +
      state.emitters.map((e) => `${e.name}=${e.live}`).join(" ");
    const lines = [head.trimEnd()];
    if (state.counters.length > 0) lines.push(state.counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { x, y } of state.particles) {
      const c = Math.min(39, Math.floor((x / state.bounds.width) * 40));
      const r = Math.min(19, Math.floor((y / state.bounds.height) * 20));
      if (c >= 0 && r >= 0) grid[r][c] += 1;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
