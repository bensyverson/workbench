import { defineGrammar, name, data, ref, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Names: a letter, then letters, digits or _ (the kit's name() also allows _x and $x, so check here).
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]*$/;
const checkName = (call, ctx, what) => {
  const n = call.args[0];
  if (typeof n === "string" && !NAME_RULE.test(n)) {
    ctx.error("Q022", `a ${what} name is a letter, then letters, digits or _; "${n}" is not`,
      { arg: 0, tip: "rename it, e.g. 'wind' or 'flame2'" });
  }
};

const BUILT_IN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

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
            checkName(call, ctx, "param");
            const o = call.args[1];
            if (o && !(o.min <= o.value && o.value <= o.max)) {
              ctx.error("Q022", `param value ${o.value} is outside ${o.min}..${o.max}`, { arg: 1, tip: "value must lie within min..max" });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            checkName(call, ctx, "field");
            if (BUILT_IN_FIELDS.includes(call.args[0])) {
              ctx.error("Q009", `"${call.args[0]}" is a built-in particle field (or kill); a .field cannot take its name`,
                { arg: 0, tip: "pick another name, e.g. 'heat2'" });
            }
          },
        },
        counter: {
          kind: "decl",
          args: [name("counter")],
          as: "counters",
          check(call, ctx) { checkName(call, ctx, "counter"); },
        },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          as: "forces",
          check(call, ctx) { checkName(call, ctx, "force"); },
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
          message: "particles never see each other, so there is no collide(); the language has no particle-to-particle interaction",
          fix: ".force(\"name\", (p, dt) => { … }) or .update((p, dt) => { … })",
        },
        sql: { message: "SQL text is not an input language", fix: ".emitter(…)" },
      },
      check(record, ctx) {
        // Cross-checks that need the whole Program (names may refer forward).
        const b = record.bounds;
        const forceNames = Object.keys(record.forces ?? {});
        for (const e of record.emitter ?? []) {
          const at = e.at;
          if (b && at) {
            if (at.x < 0 || at.x > b.width || at.y < 0 || at.y > b.height) {
              ctx.error("Q014", `emitter "${e.emitter}" at (${at.x}, ${at.y}) lies outside the bounds 0..${b.width} x 0..${b.height}`,
                { tip: "move it inside the box (edges included)" });
            }
          }
          const fs = at?.forces ?? [];
          const seen = new Set();
          for (const f of fs) {
            if (seen.has(f)) ctx.error("Q016", `emitter "${e.emitter}" names force "${f}" twice`, { tip: "list each force once" });
            seen.add(f);
          }
        }
        void forceNames;
        // Top-level bindings: no `let`; a const must be a number expression (helpers are arrows or functions).
        for (const u of record.units ?? []) {
          if (u.keyword === "let") {
            ctx.error("Q021", `top-level "let ${u.name}" is not allowed: a top-level name is fixed, so write const`,
              { tip: "use const with a number, e.g. const NAME = 3;" });
          } else if (u.keyword === "const" && !/=>|^\s*function\b/.test(u.src ?? "") &&
                     /["'`\[{]|\btrue\b|\bfalse\b|\bnull\b/.test(u.src ?? "")) {
            ctx.error("Q021", `top-level const ${u.name} is not a number; lambdas may read only number constants`,
              { tip: "make it a number expression of literals and earlier constants" });
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
    },
  },
});
