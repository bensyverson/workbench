import { defineRuntime } from "kit/define";
import { bounce } from "./bounce.grammar.js";

const DEFAULT_TICK = 1 / 30;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// What the value outputs read, derived from the balls.
const summary = (balls) => {
  let x = 0, y = 0, speed = 0;
  for (const b of balls) {
    x += b.x;
    y += b.y;
    speed += Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  }
  const n = balls.length;
  return {
    marks: balls.map((b) => ({ ball: b.name, at: [b.x, b.y], velocity: [b.vx, b.vy], radius: b.r })),
    middle: { x: x / n, y: y / n },
    meanSpeed: speed / n,
  };
};

export const bounceRuntime = defineRuntime(bounce, {
  clock: (record) => ({ tick: record.tick ?? DEFAULT_TICK }),
  init: (record) => {
    const props = Object.entries(record.props ?? {});
    const balls = Object.entries(record.balls).map(([name, b]) => ({
      name, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r,
      own: Object.fromEntries(props.map(([n, p]) => [n, p.value])),
    }));
    return { t: 0, box: { width: record.box.width, height: record.box.height }, balls, rebounds: 0, ...summary(balls) };
  },
  step(state, { dt, kernels, globals, events }) {
    const { width, height } = state.box;
    let rebounds = state.rebounds;
    globals.Math = Math;
    const balls = state.balls.map((ball) => {
      // The object the lambdas are handed: the ball's built-ins and its props, side by side.
      const b = { ...ball.own, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, r: ball.r };
      if (kernels.drift) kernels.drift(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Which walls it met, judged before any rebound lambda changes the velocity.
      const met = [];
      if (b.x - b.r <= 0 && b.vx < 0) met.push("left");
      else if (b.x + b.r >= width && b.vx > 0) met.push("right");
      if (b.y - b.r <= 0 && b.vy < 0) met.push("top");
      else if (b.y + b.r >= height && b.vy > 0) met.push("bottom");

      // Mirror the overshoot back inside; the clamps cover a ball that overshot by more than the box.
      if (b.x - b.r < 0) b.x = 2 * b.r - b.x;
      else if (b.x + b.r > width) b.x = 2 * (width - b.r) - b.x;
      if (b.y - b.r < 0) b.y = 2 * b.r - b.y;
      else if (b.y + b.r > height) b.y = 2 * (height - b.r) - b.y;
      b.x = clamp(b.x, b.r, width - b.r);
      b.y = clamp(b.y, b.r, height - b.r);

      // Turn back off every wall met before any rebound runs, so a corner's first record already leaves both walls.
      const hits = met.map((wall) => {
        const sideways = wall === "left" || wall === "right";
        const impact = Math.abs(sideways ? b.vx : b.vy);
        if (wall === "left") b.vx = impact;
        else if (wall === "right") b.vx = -impact;
        else if (wall === "top") b.vy = impact;
        else b.vy = -impact;
        return { wall, impact };
      });

      for (const { wall, impact } of hits) {
        if (kernels.rebound) kernels.rebound(b);
        rebounds += 1;
        const px = wall === "left" ? 0 : wall === "right" ? width : b.x;
        const py = wall === "top" ? 0 : wall === "bottom" ? height : b.y;
        events.hit.push({ at: [px, py], x: px, y: py, wall, impact, velocity: [b.vx, b.vy], radius: b.r, ball: ball.name });
      }

      return {
        name: ball.name, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r,
        own: Object.fromEntries(Object.keys(ball.own).map((n) => [n, b[n]])),
      };
    });
    return { t: state.t + dt, box: state.box, balls, rebounds, ...summary(balls) };
  },
  // At most 64 balls, each meeting at most one side wall and one of top or bottom in a step.
  events: { out: { hit: 128 } },
});
