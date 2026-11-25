import { defineGrammar, name, data, lambda, ref, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Names: a letter, then letters, digits or _ (Q005).
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const checkName = (what) => (call, ctx) => {
  const n = call.args[0];
  if (!NAME_RE.test(n)) {
    ctx.error("Q005", `${what} name ${JSON.stringify(n)} must be a letter, then letters, digits or _`,
      { arg: 0, fix: "a name such as `wind` or `flame_2`" });
  }
};

const RESERVED_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];

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
            checkName("param")(call, ctx);
            const { value, min, max } = call.args[1];
            if (!(min <= value && value <= max)) {
              ctx.error("Q001", `param value ${value} is outside ${min}..${max}`,
                { arg: 1, fix: "a value with min <= value <= max" });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            checkName("field")(call, ctx);
            if (RESERVED_FIELDS.includes(call.args[0])) {
              ctx.error("Q006", `field name ${call.args[0]} is a built-in particle field or verb`,
                { arg: 0, fix: "another name (built-in: pos, vel, age, life, size, kill)" });
            }
          },
        },
        counter: { kind: "decl", args: [name("counter")], check: checkName("counter") },
        force: { kind: "decl", args: [name("force"), lambda("force")], check: checkName("force") },
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
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
      rejected: {
        rate: {
          message: ".rate(...) belongs to an emitter: open one with .emitter(name, {...}) first",
          fix: "an .emitter(...) call before it, then .rate(...)",
        },
        spawn: {
          message: ".spawn(...) belongs to an emitter: open one with .emitter(name, {...}) first",
          fix: "an .emitter(...) call before it, then .spawn(...)",
        },
        collide: {
          message: "particles never see each other, so there is no .collide()",
          fix: "per-particle behaviour in a force, spawn or update lambda",
        },
      },
      check(record, ctx) {
        const b = record.bounds;
        if (!b) return; // B005 already reports the missing bounds
        for (const e of record.emitter ?? []) {
          const { x, y } = e.options;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue; // B004 already reports it
          if (x < 0 || x > b.width || y < 0 || y > b.height) {
            ctx.error("Q010", `emitter ${e.emitter} at (${x}, ${y}) lies outside the bounds ${b.width} x ${b.height}`,
              { tip: "emitters must sit inside the box, edges included", fix: "a point inside (0, 0) to (width, height)" });
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
        }, { as: "options" }),
      ],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
      check(record, ctx) {
        if (!NAME_RE.test(record.emitter)) {
          ctx.error("Q005", `emitter name ${JSON.stringify(record.emitter)} must be a letter, then letters, digits or _`,
            { arg: 0, fix: "a name such as `jet` or `nozzle_2`" });
        }
        const f = record.options?.forces ?? [];
        if (new Set(f).size !== f.length) {
          ctx.error("Q004", `emitter ${record.emitter} names a force twice`,
            { tip: "each force may appear once in forces", fix: "each force name once in forces" });
        }
      },
    },
  },
});
