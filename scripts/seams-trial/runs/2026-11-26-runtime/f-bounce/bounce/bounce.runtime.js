import { defineRuntime } from "kit/define";
import { bounce } from "./bounce.grammar.js";

// Each step, every ball runs drift, moves by its velocity, and each wall it has met is turned back off and runs rebound.
// Each meeting pushes one wallHit record, at the point on that wall where the ball touched it.
export const bounceRuntime = defineRuntime(bounce, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),
  init: (record) => ({
    t: 0,
    box: { width: record.box.width, height: record.box.height },
    balls: Object.entries(record.balls ?? {}).map(([name, b]) => ({
      name,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      r: b.r,
      props: Object.fromEntries(Object.entries(record.props ?? {}).map(([n, p]) => [n, p.value])),
    })),
    rebounds: 0,
  }),
  step(state, { T, dt, record, kernels, events }) {
    const { width: W, height: H } = state.box;
    const propNames = Object.keys(record.props ?? {});
    let rebounds = state.rebounds;
    const balls = state.balls.map((b) => {
      // The lambdas see one Ball object: the built-ins, then the props this ball carries.
      const o = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, ...b.props };
      kernels.drift?.(o, dt);
      o.x = o.x + o.vx * dt;
      o.y = o.y + o.vy * dt;
      const turn = (wall, at) => {
        events.wallHit.push({ at, wall, ball: b.name, t: T + dt });
        rebounds += 1;
        kernels.rebound?.(o);
      };
      // Each wall: reflect the center back inside, turn the velocity off the wall, then run rebound.
      if (o.x - o.r < 0) { o.x = 2 * o.r - o.x; o.vx = Math.abs(o.vx); turn("left", [0, o.y]); }
      if (o.x + o.r > W) { o.x = 2 * (W - o.r) - o.x; o.vx = -Math.abs(o.vx); turn("right", [W, o.y]); }
      if (o.y - o.r < 0) { o.y = 2 * o.r - o.y; o.vy = Math.abs(o.vy); turn("top", [o.x, 0]); }
      if (o.y + o.r > H) { o.y = 2 * (H - o.r) - o.y; o.vy = -Math.abs(o.vy); turn("bottom", [o.x, H]); }
      return {
        name: b.name,
        x: o.x,
        y: o.y,
        vx: o.vx,
        vy: o.vy,
        r: b.r,
        props: Object.fromEntries(propNames.map((n) => [n, o[n]])),
      };
    });
    return { ...state, t: T + dt, balls, rebounds };
  },
  events: { out: { wallHit: 256 } }, // 64 balls, at most four walls each in one step
});
