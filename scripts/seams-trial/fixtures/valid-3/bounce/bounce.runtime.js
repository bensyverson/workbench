import { defineRuntime } from "kit/define";
import { bounce } from "./bounce.grammar.js";

// One tick: each ball runs drift, moves by its velocity, and at each wall it crosses is put back against that
// wall, its velocity turned back off it, rebound run, and one `wall` record pushed. A ball meets at most two walls
// a tick (a corner), so a tick pushes at most two records per ball.

const MAX_BALLS = 64;

export const bounceRuntime = defineRuntime(bounce, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),
  init: (record) => ({
    t: 0,
    box: record.box,
    rebounds: 0,
    balls: Object.values(record.balls).map((o) => ({
      x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.r,
      props: Object.fromEntries(Object.entries(record.props ?? {}).map(([n, p]) => [n, p.value])),
    })),
  }),
  step(state, { dt, record, kernels, events }) {
    const names = Object.keys(record.props ?? {});
    const { width: w, height: h } = state.box;
    let rebounds = state.rebounds;
    const balls = state.balls.map((q) => {
      const b = { x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: q.r, ...q.props };
      kernels.drift?.(b, dt);
      let x = b.x + b.vx * dt, y = b.y + b.vy * dt;
      /** @param {number[]} contact */
      const meet = (contact) => {
        rebounds += 1;
        kernels.rebound?.(b);
        events.wall.push({ contact, speed: Math.hypot(b.vx, b.vy) });
      };
      if (x - b.r < 0) { x = b.r; b.vx = Math.abs(b.vx); meet([0, y]); } else if (x + b.r > w) { x = w - b.r; b.vx = -Math.abs(b.vx); meet([w, y]); }
      if (y - b.r < 0) { y = b.r; b.vy = Math.abs(b.vy); meet([x, 0]); } else if (y + b.r > h) { y = h - b.r; b.vy = -Math.abs(b.vy); meet([x, h]); }
      return { x, y, vx: b.vx, vy: b.vy, r: q.r, props: Object.fromEntries(names.map((n) => [n, b[n]])) };
    });
    return { ...state, t: state.t + dt, rebounds, balls };
  },
  events: { out: { wall: 2 * MAX_BALLS } },
});
