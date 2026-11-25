import { defineGrammar, name, data, lambda, ref, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Names: a letter, then letters, digits or _ (the kit's name() also takes _x and $).
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const checkName = (what, value, ctx) => {
  if (typeof value === "string" && !NAME.test(value)) {
    ctx.error("X001", `${what} name "${value}" is not allowed`, {
      arg: 0,
      tip: "a name is a letter, then letters, digits or _ (no leading _ or $)",
    });
  }
};

const FIELD_RESERVED = ["pos", "vel", "age", "life", "size", "kill"];

// A constant's source must be a number expression: literals and earlier constants.
const NUMBER_SRC = /^[\s\d.eE+\-*/()%]*$/;

export const particles = defineGrammar(particlesDialect, {
  root: "program",
  params: { slot: "param" },

  constructs: {
    program: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            checkName("param", call.args[0], ctx);
            const { value, min, max } = call.args[1];
            if (!(min <= value && value <= max)) {
              ctx.error("X002", `param "${call.args[0]}" has value ${value} outside ${min}..${max}`, {
                arg: 1,
                tip: "a param needs min <= value <= max",
              });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            checkName("field", call.args[0], ctx);
            if (FIELD_RESERVED.includes(call.args[0])) {
              ctx.error("X004", `field "${call.args[0]}" is a built-in particle field or verb`, {
                arg: 0,
                tip: "built-in: pos, vel, age, life, size, kill; pick another name",
              });
            }
          },
        },
        counter: {
          kind: "decl",
          args: [name("counter")],
          as: "counters",
          check(call, ctx) { checkName("counter", call.args[0], ctx); },
        },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          as: "forces",
          check(call, ctx) { checkName("force", call.args[0], ctx); },
        },
        bounds: {
          kind: "decl",
          args: [data({
            width: data("number", { min: 1, max: 4096 }),
            height: data("number", { min: 1, max: 4096 }),
          })],
          once: true,
          required: true,
        },
        maxParticles: {
          kind: "decl",
          args: [data("number", { min: 1, max: 10000, whole: true })],
          once: true,
          required: true,
        },
        tick: {
          kind: "decl",
          args: [data("number", { min: 0.001, max: 1 })],
          once: true,
        },
        seed: {
          kind: "decl",
          args: [data("number", { min: 0, whole: true })],
          once: true,
        },
        update: {
          kind: "decl",
          args: [lambda("update")],
          once: true,
        },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language, so there is no collide",
          fix: ".emitter(…).spawn((p, rng) => { … })",
        },
      },
      check(record, ctx) {
        const b = record.bounds;
        const emitters = record.emitter ?? [];
        if (b) {
          for (const e of emitters) {
            const { x, y } = e.at;
            if (x < 0 || x > b.width || y < 0 || y > b.height) {
              ctx.error("X003", `emitter "${e.emitter}" at (${x}, ${y}) lies outside the bounds`, {
                tip: `the bounds run from (0, 0) to (${b.width}, ${b.height}), edges included`,
              });
            }
          }
        }
        for (const e of emitters) {
          const seen = new Set();
          for (const f of e.at.forces ?? []) {
            if (seen.has(f)) {
              ctx.error("X005", `emitter "${e.emitter}" lists force "${f}" twice`, {
                tip: "list each force at most once, or leave forces out to get all of them",
              });
            }
            seen.add(f);
          }
        }
        // Top-level constants: a number expression, or literal/earlier constants only; no let.
        const earlier = new Set();
        for (const u of record.units ?? []) {
          if (u.keyword === "let") {
            ctx.error("X006", `top-level "let ${u.name}" is not allowed`, {
              tip: "use const for a number constant, or a helper arrow",
            });
          }
          if (u.kind === "const") {
            const ids = u.src.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
            const stripped = u.src.replace(/[A-Za-z_][A-Za-z0-9_]*/g, "");
            if (!NUMBER_SRC.test(stripped) || ids.some((id) => !earlier.has(id))) {
              ctx.error("X007", `top-level constant "${u.name}" must be a number expression`, {
                tip: "top-level constants are numbers of literals and earlier constants",
              });
            }
            earlier.add(u.name);
          }
        }
      },
    },

    emitter: {
      parent: "program",
      required: true,
      opens: [
        name("emitter"),
        data({
          x: "number",
          y: "number",
          maxRate: data("number", { min: 0 }),
          "forces?": listOf(ref("force")),
        }, { as: "at" }),
      ],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
      check(record, ctx) { checkName("emitter", record.emitter, ctx); },
    },
  },
});
