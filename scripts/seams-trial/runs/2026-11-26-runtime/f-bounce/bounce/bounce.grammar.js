import { defineGrammar, name, data, lambda } from "kit/define";
import { bounceDialect, BUILTIN } from "./bounce.dialect.js";

export const bounce = defineGrammar(bounceDialect, {
  root: "bounce",
  params: { slot: "param" },
  constructs: {
    bounce: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        box: {
          kind: "decl", args: [data({ width: "number", height: "number" })], once: true, required: true,
          check({ args: [b] }, ctx) {
            for (const k of ["width", "height"]) if (b[k] < 1 || b[k] > 4096) ctx.error("R002", `box ${k} ${b[k]} lies outside 1 to 4096`, { arg: [0, k], tip: `pick a ${k} in 1..4096` });
          },
        },
        tick: {
          kind: "decl", args: [data("number")], once: true,
          check({ args: [n] }, ctx) { if (n < 0.001 || n > 1) ctx.error("R002", `tick ${n} lies outside 0.001 to 1`, { arg: 0, tip: "pick a tick in 0.001..1 seconds" }); },
        },
        prop: {
          kind: "decl", args: [name("prop"), data({ value: "number" })], as: "props",
          check({ args: [n] }, ctx) { if (BUILTIN.includes(n)) ctx.error("R003", `prop '${n}' is named like the ball's built-in '${n}'`, { arg: 0, tip: "rename the prop" }); },
        },
        ball: { kind: "decl", args: [name("ball"), data({ x: "number", y: "number", vx: "number", vy: "number", r: "number" })], as: "balls" },
        drift: { kind: "decl", args: [lambda("drift")], once: true },
        rebound: { kind: "decl", args: [lambda("rebound")], once: true },
      },
      check(record, ctx) {
        const balls = Object.entries(record.balls ?? {});
        if (balls.length === 0) ctx.error("R004", "the Program has no ball", { tip: 'add .ball("<name>", { x, y, vx, vy, r })' });
        if (balls.length > 64) ctx.error("R005", `${balls.length} balls: a box holds at most 64`, { tip: "remove some balls" });
        const b = record.box;
        for (const [n, o] of balls) {
          if (!(o.r > 0)) ctx.error("R002", `ball '${n}': radius ${o.r} is not positive`, { tip: "give it a radius above 0" });
          if (b && (o.x - o.r < 0 || o.x + o.r > b.width || o.y - o.r < 0 || o.y + o.r > b.height)) {
            ctx.error("R006", `ball '${n}' at (${o.x}, ${o.y}) with radius ${o.r} does not fit inside the box ${b.width} x ${b.height}`, { tip: "move it inside the box" });
          }
        }
      },
    },
  },
});
