import { defineGrammar, name, data, lambda, ref, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Our own names are letter-first (dream-code.md, Names). The kit's name() also takes _x and h$t.
const NAME_OK = /^[A-Za-z][A-Za-z0-9_]*$/;
const BUILT_IN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

function checkName(ctx, value, arg, what) {
  if (typeof value === "string" && !NAME_OK.test(value)) {
    ctx.error("Q022", `${what} name "${value}" is not a letter followed by letters, digits or _`, {
      arg,
      tip: "use a name like rate, fallRate2 or heat_loss",
    });
  }
}

export const particles = defineGrammar(particlesDialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        collide: {
          message: "particles never see each other in this language: there is no collide()",
          tip: "give each particle its own motion in forces and update",
        },
      },
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            const [n, o] = call.args;
            checkName(ctx, n, 0, "param");
            if (o && (o.value < o.min || o.value > o.max)) {
              ctx.error("Q022", `param "${n}" value ${o.value} is outside ${o.min}..${o.max}`, {
                arg: 1,
                tip: "the value must satisfy min <= value <= max",
              });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            checkName(ctx, call.args[0], 0, "field");
            if (BUILT_IN_FIELDS.includes(call.args[0])) {
              ctx.error("Q009", `"${call.args[0]}" is a built-in particle field, not a new one`, {
                arg: 0,
                tip: "pick another name: built-in fields are pos, vel, age, life, size and kill",
              });
            }
          },
        },
        counter: {
          kind: "decl",
          args: [name("counter")],
          as: "counters",
          check(call, ctx) { checkName(ctx, call.args[0], 0, "counter"); },
        },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          as: "forces",
          check(call, ctx) { checkName(ctx, call.args[0], 0, "force"); },
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
      check(record, ctx) {
        const b = record.bounds;
        if (!b) return;
        for (const e of record.emitter ?? []) {
          const { x, y } = e.at;
          if (x < 0 || x > b.width || y < 0 || y > b.height) {
            ctx.error("Q014", `emitter "${e.name}" at (${x}, ${y}) is outside the bounds 0..${b.width} x 0..${b.height}`, {
              tip: "place the emitter inside the box, edges included",
            });
          }
        }
      },
    },
    emitter: {
      parent: "program",
      required: true,
      opens: [name("emitter", { as: "name" }), data({ x: "number", y: "number", maxRate: "number", "forces?": listOf(ref("force")) }, { as: "at" })],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
      check(record, ctx) {
        checkName(ctx, record.name, 0, "emitter");
        if (record.at.maxRate < 0) {
          ctx.error("Q014", `emitter "${record.name}" maxRate ${record.at.maxRate} is negative`, {
            arg: 1,
            tip: "maxRate is particles per second, at least 0",
          });
        }
        const f = record.at.forces ?? [];
        if (new Set(f).size !== f.length) {
          ctx.error("Q016", `emitter "${record.name}" lists a force twice`, {
            arg: 1,
            tip: "each force appears at most once in forces",
          });
        }
      },
    },
  },
});
