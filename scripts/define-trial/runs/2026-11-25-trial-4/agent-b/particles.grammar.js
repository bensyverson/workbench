import { defineGrammar, name, ref, data, lambda, oneOf, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const BUILTIN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];
const whole = (n) => Number.isInteger(n);

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", as: "params",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          check({ args: [n, p] }, ctx) {
            if (p.min > p.max || p.value < p.min || p.value > p.max)
              ctx.error("K001", `param '${n}': value ${p.value} must lie within min..max`, { arg: 1, tip: "keep min <= value <= max" });
          },
        },
        field: {
          kind: "decl", as: "fields",
          args: [name("field"), data({ value: "number" })],
          check({ args: [n] }, ctx) {
            if (BUILTIN_FIELDS.includes(n)) ctx.error("K002", `field '${n}' is named like a built-in field`, { arg: 0, tip: "rename the field" });
          },
        },
        counter: { kind: "decl", as: "counters", args: [name("counter")] },
        bounds: {
          kind: "decl", once: true, required: true, args: [data({ width: "number", height: "number" })],
          check({ args: [b] }, ctx) {
            for (const k of ["width", "height"])
              if (!(b[k] >= 1 && b[k] <= 4096)) ctx.error("K003", `bounds ${k} must be 1 to 4096`, { arg: 0, tip: "pick a size from 1 to 4096" });
          },
        },
        maxParticles: {
          kind: "decl", once: true, required: true, args: [data("number")],
          check({ args: [n] }, ctx) {
            if (!whole(n) || n < 1 || n > 10000) ctx.error("K004", "maxParticles must be a whole number from 1 to 10000", { arg: 0, tip: "write a whole number from 1 to 10000" });
          },
        },
        tick: {
          kind: "decl", once: true, args: [data("number")],
          check({ args: [n] }, ctx) {
            if (!(n >= 0.001 && n <= 1)) ctx.error("K005", "tick must be 0.001 to 1 seconds", { arg: 0, tip: "write seconds per tick, 0.001 to 1" });
          },
        },
        seed: {
          kind: "decl", once: true, args: [data("number")],
          check({ args: [n] }, ctx) {
            if (!whole(n) || n < 0) ctx.error("K006", "seed must be a whole number, at least 0", { arg: 0, tip: "write a whole number >= 0" });
          },
        },
        update: { kind: "decl", once: true, args: [lambda("update")] },
        force: { kind: "decl", args: [name("force"), lambda("force")] },
      },
      check(record, ctx) {
        const emitters = record.emitter ?? [];
        if (emitters.length === 0) ctx.error("K007", "a Program needs at least one emitter", { tip: "add .emitter(\"name\", { x, y, maxRate })" });
        const b = record.bounds;
        if (!b) return;
        for (const e of emitters) {
          const o = e.opts;
          if (o && (o.x < 0 || o.x > b.width || o.y < 0 || o.y > b.height))
            ctx.error("K008", `emitter '${e.name}' lies outside the bounds`, { tip: "move it inside 0..width, 0..height" });
        }
      },
    },
    emitter: {
      parent: "particles",
      opens: [name("emitter"), data({ x: "number", y: "number", maxRate: "number", "forces?": listOf(ref("force")) }, { as: "opts" })],
      slots: {
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")] },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")] },
      },
      check(record, ctx) {
        const o = record.opts;
        if (o.maxRate < 0) ctx.error("K009", "maxRate must be at least 0", { tip: "write maxRate >= 0" });
        const f = o.forces ?? [];
        if (new Set(f).size !== f.length) ctx.error("K010", "an emitter's forces list names a force twice", { tip: "list each force once" });
      },
    },
  },
});
