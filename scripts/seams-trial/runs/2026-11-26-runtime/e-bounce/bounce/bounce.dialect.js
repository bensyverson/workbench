import { defineDialect, exact, list, struct, vector } from "kit/define";

// Balls in a box: each ball flies in a straight line and bounces off the box's four walls. A Program declares the
// box, its balls, and the numbers every ball carries (.prop); its lambdas say how a ball's velocity changes as it
// flies (drift) and what happens to it each time it meets a wall (rebound).
export const BUILTIN = ["x", "y", "vx", "vy", "r"];

export const bounceDialect = defineDialect({
  name: "bounce",
  numberType: "f64",
  types: { vec2: vector(2, "f64") },
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
    const props = {}, own = {};
    for (const n of Object.keys(program.props ?? {})) if (!BUILTIN.includes(n)) {
      props[n] = { value: "f64", write: true };
      own[n] = "f64"; // where its value lasts between steps: balls[i].own.<n>
    }
    return { objects: { Params: { members: params }, Ball: { members: props } }, state: own };
  },
  // The run's state: what the host computes after each tick, and hands text(state) and the UI's views.
  state: {
    t: "f64",
    box: struct({ width: "f64", height: "f64" }),
    balls: list(struct({ name: "str", x: "f64", y: "f64", vx: "f64", vy: "f64", r: "f64", own: struct({}, { extensible: true }) }), 64),
    rebounds: "f64",
    // What the value outputs read, refreshed after each step.
    marks: list(struct({ ball: "str", at: "vec2", velocity: "vec2", radius: "f64" }), 64),
    middle: struct({ x: "f64", y: "f64" }),
    meanSpeed: "f64",
  },
  frames: {
    box: {
      dims: 2,
      note: "The inside of the box. (0, 0) is its top-left corner, x points right, y points down; one unit is one box unit, the unit the Program gives the box's width and height in. The box spans 0..width by 0..height.",
      extent: (record) => ({ min: [0, 0], max: [record.box.width, record.box.height] }),
    },
    across: {
      dims: 1,
      note: "The box's horizontal axis alone: 0 is the left wall, the box's width is the right wall, values grow rightward; one unit is one box unit.",
      extent: (record) => ({ min: [0], max: [record.box.width] }),
    },
    down: {
      dims: 1,
      note: "The box's vertical axis alone: 0 is the top wall, the box's height is the bottom wall, values grow DOWNWARD; one unit is one box unit.",
      extent: (record) => ({ min: [0], max: [record.box.height] }),
    },
  },
  ports: {
    out: {
      hit: {
        seam: "Event<{ at: point2@box, x: point1@across, y: point1@down, wall: 'left' | 'right' | 'top' | 'bottom', impact: f64@box/s, velocity: vec2@box/s, radius: f64@box, ball: str }>",
        note: "One record each time a ball meets a wall (a corner gives two, one per wall). at: the point on the wall where the ball touched it, in box; x and y: that same point's horizontal and vertical position alone, in across and down; wall: which wall; impact: how fast the ball was moving into the wall just before it turned back, 0 or more, box units per second; velocity: its velocity after the rebound; radius: the ball's radius; ball: the ball's name. A ball resting against a wall that something keeps pushing it into sends a record with a small impact on every step.",
      },
      balls: {
        seam: "list<{ ball: str, at: point2@box, velocity: vec2@box/s, radius: f64@box }, 64>",
        from: "marks",
        note: "Every ball, in the same order throughout a run: ball is its name, at its center in box, velocity in box units per second, radius in box units. Fresh after each step.",
      },
      center: {
        seam: "point2@box",
        from: (s) => [s.middle.x, s.middle.y],
        note: "The average of the balls' centers (each ball counts equally, whatever its size), in box. Fresh after each step.",
      },
      centerX: { seam: "point1@across", from: "middle.x", note: "The horizontal position of the average of the balls' centers, in across (0 = left wall). Fresh after each step." },
      centerY: { seam: "point1@down", from: "middle.y", note: "The vertical position of the average of the balls' centers, in down (0 = top wall; larger is lower). Fresh after each step." },
      meanSpeed: { seam: "f64@box/s", from: "meanSpeed", note: "The average of the balls' speeds, 0 or more, in box units per second: how lively the box is. Fresh after each step." },
      rebounds: { seam: "f64", from: "rebounds", note: "How many times any ball has met a wall since the run began: a whole number that never falls. A corner counts two." },
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
