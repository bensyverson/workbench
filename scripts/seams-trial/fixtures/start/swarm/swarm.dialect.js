import { defineDialect, exact, list, struct } from "kit/define";

// A swarm on open ground: groups of agents, each placed around its group's home, each steering by the Program's
// rules. Agents never see each other. A Program declares the ground, its groups, the numbers every agent carries
// (.trait), named steering rules (.steer, each run on every agent each tick) and an update.
export const BUILTIN = ["x", "y", "vx", "vy", "hx", "hy", "age"];

export const swarmDialect = defineDialect({
  name: "swarm",
  numberType: "f64",
  spaces: {
    // steer and update are each handed one agent and may change that agent only.
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
  globals: { $: "Params", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // each .steer runs once per tick on every agent, in the order the Program declares them; dt is the tick.
    steer: { params: ["Agent", "f64"], returns: "void", space: "agent", body: "block", may: ["write Agent"] },
    // update runs once per tick on every agent, after the steers and before it moves.
    update: { params: ["Agent", "Rng", "f64"], returns: "void", space: "agent", body: "block", may: ["write Agent", "rng"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const traits = {};
    for (const n of Object.keys(program.traits ?? {})) if (!BUILTIN.includes(n)) traits[n] = { value: "f64", write: true };
    return { objects: { Params: { members: params }, Agent: { members: traits } } };
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  state: {
    t: "f64",
    ground: struct({ width: "f64", height: "f64" }),
    agents: list(struct({ x: "f64", y: "f64" }), 2000),
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
