import { defineDialect, exact, list, struct, vector } from "kit/define";

// A swarm on open ground: groups of agents, each placed around its group's home, each steering by the Program's
// rules. Agents never see each other. A Program declares the ground, its groups, the numbers every agent carries
// (.trait), named steering rules (.steer, each run on every agent each tick), an update, and an answer to a lure.
export const BUILTIN = ["x", "y", "vx", "vy", "hx", "hy", "age"];

export const swarmDialect = defineDialect({
  name: "swarm",
  numberType: "f64",
  spaces: {
    // steer, update and answer are each handed one agent and may change that agent only.
    agent: { instance: "Agent" },
  },
  objects: {
    Agent: {
      label: "the agent (a)",
      members: {
        x: "f64", // where it stands, in ground units from the left edge: the host moves it
        y: "f64", // in ground units down from the top edge
        vx: { value: "f64", write: true }, // its velocity, ground units per second; the host caps it at its group's speed
        vy: { value: "f64", write: true },
        hx: "f64", // its group's home
        hy: "f64",
        age: "f64", // seconds since it was placed; only the host writes it
        // environment(program) adds one { value: "f64", write: true } per .trait
      },
      rejected: { neighbors: { message: "agents never see each other in this language", tip: "keep what an agent needs in its own traits" } },
    },
    Rng: { label: "update's random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Params: { label: "the params ($)", members: {} },
    // the value inputs (input.wind), filled by the kit from the wires
    Inputs: { label: "the inputs (input): values the host drives", members: {} },
    Math: {
      label: "Math",
      members: {
        min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
        sqrt: { fn: { params: ["f64"], returns: "f64" } },
        sin: { fn: { params: ["f64"], returns: "f64" } },
        cos: { fn: { params: ["f64"], returns: "f64" } },
        PI: "f64",
      },
      rejected: { random: { message: "Math.random is not reproducible; the seeded stream is update's rng", fix: "rng() inside the update lambda" } },
    },
  },
  types: { vec2: vector(2, "f64") },
  globals: { $: "Params", Math: "Math", input: "Inputs" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // each .steer runs once per tick on every agent, in the order the Program declares them; dt is the tick.
    steer: { params: ["Agent", "f64"], returns: "void", space: "agent", body: "block", may: ["write Agent"] },
    // update runs once per tick on every agent, after the steers and before it moves.
    update: { params: ["Agent", "Rng", "f64"], returns: "void", space: "agent", body: "block", may: ["write Agent", "rng"] },
    // answer runs once for each record on the lure input, on every agent, before the steers; it reads the record as `lure`.
    answer: { params: ["Agent", "f64"], returns: "void", space: "agent", body: "block", may: ["write Agent"] },
  },
  params: { object: "Params", name: "$" },
  frames: {
    ground: {
      dims: 2,
      note: "the ground: x runs right from its left edge, y runs down from its top edge; one unit is one ground unit; the origin is the top-left corner; the ground is ground.width by ground.height units",
      extent: (record) => ({ min: [0, 0], max: [record.ground.width, record.ground.height] }),
    },
  },
  ports: {
    in: {
      lure: {
        seam: "Event<{ at: point2@ground, strength: f64 = 1 }>",
        note: "a call to a point: each record draws every agent toward `at` (a ground position, in ground units) through the Program's answer lambda, which reads the record as `lure` (lure.at, lure.strength); strength defaults to 1, a larger value pulls harder; a record arrives once, at the step that follows it",
        delivery: "reliable",
        record: { name: "lure", slots: ["answer"] },
      },
      wind: {
        seam: "vec2@ground/s",
        default: [0, 0],
        note: "a steady push on every agent, in ground units per second, along x and y; read by the Program's steers as input.wind (input.wind.x, input.wind.y); zero when nothing is wired",
      },
    },
  },
  inputs: { object: "Inputs", name: "input" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const traits = {};
    const state = {};
    for (const n of Object.keys(program.traits ?? {})) {
      if (BUILTIN.includes(n)) continue;
      traits[n] = { value: "f64", write: true };
      state[n] = "f64"; // a trait lives in each agent's traits struct, from step to step
    }
    return { objects: { Params: { members: params }, Agent: { members: traits } }, state };
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  state: {
    t: "f64",
    ground: struct({ width: "f64", height: "f64" }),
    agents: list(
      struct({
        x: "f64",
        y: "f64",
        vx: "f64",
        vy: "f64",
        hx: "f64",
        hy: "f64",
        age: "f64",
        speed: "f64", // its group's speed: the cap on its velocity
        traits: struct({}, { extensible: true }), // one number per .trait the Program declares
      }),
      2000,
    ),
    groups: list(struct({ name: "str", count: "f64" }), 50),
  },
  text(state) {
    const w = 40, h = 20;
    const grid = Array.from({ length: h }, () => new Array(w).fill(0));
    for (const { x, y } of state.agents) {
      const c = Math.min(w - 1, Math.max(0, Math.floor((x / state.ground.width) * w)));
      const r = Math.min(h - 1, Math.max(0, Math.floor((y / state.ground.height) * h)));
      grid[r][c] += 1;
    }
    const head = `t=${state.t.toFixed(2)} agents=${state.agents.length} ` + state.groups.map((g) => `${g.name}=${g.count}`).join(" ");
    return [head.trimEnd(), ...grid.map((row) => row.map((n) => (n === 0 ? "." : n >= 10 ? "#" : String(n))).join(""))].join("\n");
  },
});
