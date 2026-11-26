import { defineDialect, vector, exact, list, struct } from "kit/define";

// The particle's built-in fields; a .field may not take one of these names (or "kill").
export const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

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
    // The value inputs, read in lambdas as inp.intensity, inp.wind, inp.target. The kit fills the members from ports.in.
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
  frames: {
    px: {
      dims: 2,
      note: "the particle box, in pixels: x right, y down; (0, 0) is the box's top-left corner and (width, height), from the Program's bounds, its bottom-right corner. Positions are continuous points, not pixel indices.",
      extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] }),
    },
  },
  // Inputs, and what the host does with each. Time is in seconds throughout.
  //
  // Event inputs. Before each tick the host takes the records produced since its last tick (already in px). For each
  // record, in order, every emitter whose trigger option names that input spawns count particles at once, in the order
  // the emitters were declared. Each particle starts as one from rate does, and runs the emitter's spawn lambda (same
  // rng stream; i goes on numbering that emitter's particles), except for where it starts:
  //   burst: p.pos starts at the record's at, not at the emitter's x, y. The point may lie outside the box.
  //   pulse: p.pos starts at the emitter's x, y.
  // maxRate limits rate only, not triggered particles. maxParticles limits both: what does not fit is dropped, not
  // queued. A record for an input no emitter names does nothing.
  //
  // Value inputs. Before each tick the host takes each wired input's latest value (already in px), or the default when
  // nothing is wired, and holds it for the whole tick: every lambda in that tick reads the same inp. The host itself
  // does nothing else with them; they matter only where a Program's lambdas read them.
  ports: {
    in: {
      burst: {
        seam: "Event<{ at: point2@px }>",
        note: "something happened at a place: each record makes every emitter whose trigger is 'burst' spawn its count of particles at at, a point in px. Does nothing in a Program with no such emitter.",
      },
      pulse: {
        seam: "Event<{}>",
        note: "something happened, with no place (a beat, a button): each record makes every emitter whose trigger is 'pulse' spawn its count of particles at its own position. Does nothing in a Program with no such emitter.",
      },
      intensity: {
        seam: "f64", default: 1,
        note: "a plain multiplier for how lively the system is: 1 is normal, 0 is meant as quiet, 2 as double. No unit, never converted. Only Programs whose lambdas read inp.intensity respond.",
      },
      wind: {
        seam: "vec2@px", default: [0, 0],
        note: "a velocity or push in px per second (x right, y down); the length unit is converted on the wire, the time unit is not, so send it per second. Only Programs whose lambdas read inp.wind respond, and they decide how.",
      },
      target: {
        seam: "point2@px", default: [0, 0],
        note: "a place of interest in px, such as something to be drawn toward or to follow; may lie outside the box. Unwired it is (0, 0), the top-left corner. Only Programs whose lambdas read inp.target respond.",
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
  // What the host does with the inputs before each tick is described at ports, above.
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
