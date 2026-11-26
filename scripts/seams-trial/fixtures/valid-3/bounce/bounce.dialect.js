import { defineDialect, exact, list, struct } from "kit/define";

// Balls in a box: each ball flies in a straight line and bounces off the box's four walls. A Program declares the
// box, its balls, and the numbers every ball carries (.prop); its lambdas say how a ball's velocity changes as it
// flies (drift) and what happens to it each time it meets a wall (rebound).
export const BUILTIN = ["x", "y", "vx", "vy", "r"];

export const bounceDialect = defineDialect({
  name: "bounce",
  numberType: "f64",
  spaces: {
    // drift and rebound are each handed one ball and may change that ball only.
    ball: { instance: "Ball" },
  },
  objects: {
    Ball: {
      label: "the ball (b)",
      members: {
        x: "f64", // its center, in box units from the left wall: the host moves it
        y: "f64", // its center, in box units down from the top wall
        vx: { value: "f64", write: true }, // its velocity, box units per second
        vy: { value: "f64", write: true },
        r: "f64", // its radius, in box units
        // environment(program) adds one { value: "f64", write: true } per .prop
      },
    },
    Params: { label: "the params ($)", members: {} },
    Math: {
      label: "Math",
      members: {
        min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
        sqrt: { fn: { params: ["f64"], returns: "f64" } },
      },
      rejected: { random: { message: "Math.random is not reproducible, and a ball's flight is not random in this language", tip: "give the ball a .prop and change it in rebound" } },
    },
  },
  globals: { $: "Params", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // drift runs once per tick for each ball, before it moves; dt is the tick in seconds.
    drift: { params: ["Ball", "f64"], returns: "void", space: "ball", body: "block", may: ["write Ball"] },
    // rebound runs once each time a ball meets a wall, after the host has turned its velocity back off that wall.
    rebound: { params: ["Ball"], returns: "void", space: "ball", body: "block", may: ["write Ball"] },
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const props = {}, state = {};
    for (const n of Object.keys(program.props ?? {})) {
      if (!BUILTIN.includes(n)) { props[n] = { value: "f64", write: true }; state[n] = "f64"; }
    }
    // each .prop is also a field of every ball's state, so what rebound leaves in it lasts
    return { objects: { Params: { members: params }, Ball: { members: props } }, state };
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  state: {
    t: "f64",
    box: struct({ width: "f64", height: "f64" }),
    balls: list(struct({ x: "f64", y: "f64", vx: "f64", vy: "f64", r: "f64", props: struct({}, { extensible: true }) }), 64),
    rebounds: "f64",
  },
  frames: {
    box: {
      dims: 2,
      note: "the box: x to the right from the left wall, y down from the top wall, one unit is one box unit (the Program's .box width and height)",
      extent: (record) => ({ min: [0, 0], max: [record.box.width, record.box.height] }),
    },
  },
  ports: {
    out: {
      wall: { seam: "Event<{ contact: point2@box, speed: f64@box/s }>", note: "a ball met a wall during this step: contact is the point on the wall it touched, speed how fast it was going as it left; one record per meeting, none on most steps" },
      rebounds: { seam: "f64", from: "rebounds", note: "how many times balls have met walls since the run began" },
    },
  },
  text(state) {
    const w = 40, h = 16;
    const grid = Array.from({ length: h }, () => new Array(w).fill("."));
    for (const { x, y } of state.balls) {
      const c = Math.min(w - 1, Math.max(0, Math.floor((x / state.box.width) * w)));
      const r = Math.min(h - 1, Math.max(0, Math.floor((y / state.box.height) * h)));
      grid[r][c] = "o";
    }
    return [`t=${state.t.toFixed(2)} balls=${state.balls.length} rebounds=${state.rebounds}`, ...grid.map((row) => row.join(""))].join("\n");
  },
});
