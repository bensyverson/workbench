import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect, BUILT_IN_FIELDS } from "./particles.dialect.js";

// Codes: Qnnn, where nnn is the refusal number on the language sheet.

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

function checkName(value, ctx) {
  if (typeof value === "string" && !NAME.test(value)) {
    ctx.error("Q022", `'${value}' is not a name: a letter, then letters, digits or '_'`, {
      arg: 0, tip: "rename it",
    });
  }
}

const namedCheck = (call, ctx) => checkName(call.args[0], ctx);

export const particles = defineGrammar(particlesDialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      // The record gives each top-level constant a lambda reads as its value.
      check(record, ctx) {
        for (const unit of record.units ?? []) {
          if (unit.kind !== "const") continue;
          if (unit.keyword === "let") {
            ctx.error("Q019", `a lambda reads '${unit.name}', a top-level let`, {
              tip: "declare it with const: lambdas see only number constants",
            });
          } else if (!Number.isFinite(Number(unit.src))) {
            ctx.error("Q019", `a lambda reads '${unit.name}', a top-level constant that is not a number`, {
              tip: "lambdas see only number constants",
            });
          }
        }
      },
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            checkName(call.args[0], ctx);
            const { value, min, max } = call.args[1];
            if (!(min <= value && value <= max)) {
              ctx.error("Q022", `param '${call.args[0]}' has value ${value} outside min ${min} to max ${max}`, {
                arg: 1, tip: "give min <= value <= max",
              });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            checkName(call.args[0], ctx);
            if (BUILT_IN_FIELDS.includes(call.args[0])) {
              ctx.error("Q009", `a field may not be named '${call.args[0]}': the particle already has it`, {
                arg: 0, tip: "choose another name",
              });
            }
          },
        },
        counter: { kind: "decl", args: [name("counter")], check: namedCheck },
        force: { kind: "decl", args: [name("force"), lambda("force")], check: namedCheck },
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
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        seed: { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language, so there is no collide",
          fix: ".force(name, (p, dt) => { … })",
        },
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
        }, { as: "options" }),
      ],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
      check(record, ctx) {
        checkName(record.emitter, ctx);
        const options = record.options;
        if (options === null || typeof options !== "object") return;
        const bounds = ctx.program?.bounds;
        const { x, y, forces } = options;
        // A box that is itself wrong was already reported: it raises nothing further here.
        const sized = (n) => typeof n === "number" && n >= 1 && n <= 4096;
        if (bounds && sized(bounds.width) && sized(bounds.height) && Number.isFinite(x) && Number.isFinite(y)
          && !(x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height)) {
          ctx.error("Q014", `emitter '${record.emitter}' at (${x}, ${y}) is outside the bounds ${bounds.width} by ${bounds.height}`, {
            tip: "place it inside the box, edges included",
          });
        }
        if (Array.isArray(forces)) {
          const seen = new Set();
          for (const force of forces) {
            if (seen.has(force)) {
              ctx.error("Q016", `emitter '${record.emitter}' lists the force '${force}' twice`, { tip: "name each force once" });
            }
            seen.add(force);
          }
        }
      },
    },
  },
});
