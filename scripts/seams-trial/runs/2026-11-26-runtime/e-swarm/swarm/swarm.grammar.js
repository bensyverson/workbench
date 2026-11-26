import { defineGrammar, name, data, lambda } from "kit/define";
import { swarmDialect, BUILTIN } from "./swarm.dialect.js";

export const swarm = defineGrammar(swarmDialect, {
  root: "swarm",
  params: { slot: "param" },
  constructs: {
    swarm: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        ground: {
          kind: "decl", args: [data({ width: "number", height: "number" })], once: true, required: true,
          check({ args: [g] }, ctx) {
            for (const k of ["width", "height"]) if (g[k] < 1 || g[k] > 4096) ctx.error("R002", `ground ${k} ${g[k]} lies outside 1 to 4096`, { arg: [0, k], tip: `pick a ${k} in 1..4096` });
          },
        },
        tick: {
          kind: "decl", args: [data("number")], once: true,
          check({ args: [n] }, ctx) { if (n < 0.001 || n > 1) ctx.error("R002", `tick ${n} lies outside 0.001 to 1`, { arg: 0, tip: "pick a tick in 0.001..1 seconds" }); },
        },
        trait: {
          kind: "decl", args: [name("trait"), data({ value: "number" })], as: "traits",
          check({ args: [n] }, ctx) { if (BUILTIN.includes(n)) ctx.error("R003", `trait '${n}' is named like the agent's built-in '${n}'`, { arg: 0, tip: "rename the trait" }); },
        },
        group: {
          kind: "decl", args: [name("group"), data({ count: data("number", { min: 1, whole: true }), x: "number", y: "number", spread: "number", speed: "number" })], as: "groups",
        },
        steer: { kind: "decl", args: [name("steer"), lambda("steer")], as: "steers" },
        update: { kind: "decl", args: [lambda("update")], once: true },
        heed: { kind: "decl", args: [lambda("heed")], once: true },
      },
      check(record, ctx) {
        const groups = Object.entries(record.groups ?? {});
        if (groups.length === 0) ctx.error("R004", "the Program has no group", { tip: 'add .group("<name>", { count, x, y, spread, speed })' });
        const total = groups.reduce((n, [, g]) => n + g.count, 0);
        if (total > 2000) ctx.error("R005", `${total} agents: the ground holds at most 2000`, { tip: "lower some group's count" });
        const b = record.ground;
        for (const [n, g] of groups) {
          if (b && (g.x < 0 || g.x > b.width || g.y < 0 || g.y > b.height)) ctx.error("R006", `group '${n}' at (${g.x}, ${g.y}) lies outside the ground ${b.width} x ${b.height}`, { tip: "move its home onto the ground" });
          if (!(g.speed > 0)) ctx.error("R002", `group '${n}': speed ${g.speed} is not positive`, { tip: "give it a speed above 0" });
        }
      },
    },
  },
});
