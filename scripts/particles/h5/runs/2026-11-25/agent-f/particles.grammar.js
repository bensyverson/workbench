import { defineGrammar, name, data, lambda, ref, listOf } from "kit/define";
import { particlesLang } from "./particles.dialect.js";

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED = ["pos", "vel", "age", "life", "size", "kill"];

const checkIdent = (value, ctx, arg) => {
  if (typeof value !== "string" || !IDENT.test(value)) {
    ctx.error("Q005", `"${value}" is not a name: a letter, then letters, digits or _`, {
      arg,
      fix: "a name such as heat or burned_out",
    });
  }
};

export const particles = defineGrammar(particlesLang, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            checkIdent(call.args[0], ctx, 0);
            const { value, min, max } = call.args[1];
            if (value < min || value > max) {
              ctx.error("Q002", `param value ${value} lies outside min ${min}..max ${max}`, {
                arg: 1,
                fix: `value between ${min} and ${max}`,
              });
            }
          },
        },
        bounds: {
          kind: "decl",
          args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })],
          once: true,
          required: true,
        },
        maxParticles: {
          kind: "decl",
          args: [data("number", { min: 1, max: 10000, whole: true })],
          once: true,
          required: true,
        },
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        seed: { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            checkIdent(call.args[0], ctx, 0);
            if (RESERVED.includes(call.args[0])) {
              ctx.error("Q006", `"${call.args[0]}" is a built-in particle field, not a new one`, {
                arg: 0,
                fix: "another name, such as heat",
              });
            }
          },
        },
        counter: {
          kind: "decl",
          args: [name("counter")],
          as: "counters",
          check(call, ctx) { checkIdent(call.args[0], ctx, 0); },
        },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          as: "forces",
          check(call, ctx) { checkIdent(call.args[0], ctx, 0); },
        },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language, so there is no collide()",
          fix: "a value computed from the particle itself, the params or counters",
        },
      },
      check(record, ctx) {
        checkIdent(record.name, ctx, 0);
        const b = record.bounds;
        if (!b) return; // bounds is required: the builder reports B005
        for (const e of record.emitter ?? []) {
          const at = e.at;
          if (at.x < 0 || at.x > b.width || at.y < 0 || at.y > b.height) {
            ctx.error("Q003", `emitter "${e.emitter}" at (${at.x}, ${at.y}) lies outside the bounds 0..${b.width} x 0..${b.height}`, {
              fix: "x and y inside the bounds, edges included",
            });
          }
          const seen = new Set();
          for (const f of at.forces ?? []) {
            if (seen.has(f)) {
              ctx.error("Q004", `emitter "${e.emitter}" lists force "${f}" twice`, {
                fix: "each force listed once in forces",
              });
            }
            seen.add(f);
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      check(record, ctx) { checkIdent(record.emitter, ctx, 0); },
      opens: [
        name("emitter"),
        data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) }, { as: "at" }),
      ],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
    },
  },
});
