import { defineDialect, vector, exact, list, struct } from "kit/define";

// The particle's built-in fields; a .field may not take one of these names (or "kill").
export const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

// The inputs that are Events, so an emitter's trigger can be one of them (a value input cannot trigger anything).
export const EVENT_INPUTS = ["burst"];

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  // Sheet: every condition is a boolean; vectors multiply by a number only.
  conditions: "bool",
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
        age: "f64", // only the host writes it
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
    // filled from ports.in by the kit: one member per value input, read in any lambda as inp.<name>
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
  params: { object: "Params", name: "$" },
  inputs: { object: "In", name: "inp" },
  // The one space everything here is measured in: the box a Program sets with .bounds.
  frames: {
    px: {
      dims: 2,
      note: "pixels of the particle box set by .bounds({ width, height }); x right, y down; (0, 0) is the box's top-left corner and (width, height) its bottom-right corner",
      extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] }),
    },
  },
  // What the host accepts from outside, before each tick. The host's handling of each one:
  // - burst (an Event): before a tick, the host takes the records that arrived since its last tick, already in px.
  //   For every record, and for every emitter whose trigger is "burst", it calls that emitter's rate(t, live) once
  //   and spawns that many particles at once (rounded down, at most the emitter's maxRate, and never past
  //   maxParticles), each starting at the record's 'at' instead of the emitter's (x, y), then runs spawn on each
  //   as usual. An emitter with a trigger does not emit on its own between records. Records outside the box are
  //   still used; their particles live until something kills them, as any particle does. With nothing wired, no
  //   records arrive and triggered emitters stay quiet.
  // - level and target (values): the host does nothing with them itself; before each tick it makes the wired
  //   value (or the default when nothing is wired) readable in every lambda as inp.level and inp.target.
  ports: {
    in: {
      burst: {
        seam: "Event<{ at: point2@px }>",
        note: "each record spawns a burst at its position 'at' (a point in px, inside the box set by .bounds) from every emitter whose trigger is 'burst'; the emitter's rate gives how many particles one record makes. Send one record per moment something should burst, e.g. when an item is picked up or a note is struck",
      },
      level: {
        seam: "f64",
        default: 1,
        note: "an untagged number, usually 0 to 1, that the Program's lambdas read as inp.level, e.g. to scale a rate or a speed; read fresh before every tick, 1 when nothing is wired",
      },
      target: {
        seam: "point2@px",
        default: [0, 0],
        note: "a position in px (x right, y down, (0, 0) the box's top-left corner) that the Program's lambdas read as inp.target, e.g. a force that pulls particles toward a moving thing; read fresh before every tick, (0, 0) when nothing is wired",
      },
    },
  },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) {
      if (!BUILTIN_FIELDS.includes(n)) fields[n] = { value: "f64", write: true };
    }
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
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  // The inputs above add nothing to it: burst records are used up in the tick they arrive for, and value inputs
  // are read through inp, not stored.
  state: {
    t: "f64",
    maxParticles: "f64",
    bounds: struct({ width: "f64", height: "f64" }),
    particles: list(struct({ x: "f64", y: "f64" }), 10000),
    emitters: list(struct({ name: "str", live: "f64" }), 100),
    counters: list(struct({ name: "str", value: "f64" }), 100),
  },
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
