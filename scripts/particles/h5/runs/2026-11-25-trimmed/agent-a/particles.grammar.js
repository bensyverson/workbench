import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const BUILT_IN = ["pos", "vel", "age", "life", "size", "kill"];

function checkName(value, ctx) {
  if (typeof value === "string" && !NAME.test(value)) {
    ctx.error("R022", `'${value}' is not a name: a name is a letter, then letters, digits or _`, { arg: 0, tip: "start the name with a letter" });
  }
}
const named = (call, ctx) => checkName(call.args[0], ctx);

export const particles = defineGrammar(particlesDialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", as: "params",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          check(call, ctx) {
            named(call, ctx);
            const { value, min, max } = call.args[1];
            if (![value, min, max].every(Number.isFinite) || !(min <= value && value <= max)) {
              ctx.error("R022", `param '${call.args[0]}' needs finite numbers with min <= value <= max, got value ${value}, min ${min}, max ${max}`, { arg: 1, tip: "pick a value inside min..max" });
            }
          },
        },
        field: {
          kind: "decl", as: "fields",
          args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            named(call, ctx);
            if (BUILT_IN.includes(call.args[0])) {
              ctx.error("R009", `a field may not be named '${call.args[0]}': the particle already uses that name`, { arg: 0 });
            }
          },
        },
        counter: { kind: "decl", as: "counters", args: [name("counter")], check: named },
        force: { kind: "decl", as: "forces", args: [name("force"), lambda("force")], check: named },
        bounds: {
          kind: "decl", once: true, required: true,
          args: [data({
            width: data("number", { min: 1, max: 4096 }),
            height: data("number", { min: 1, max: 4096 }),
          })],
        },
        maxParticles: { kind: "decl", once: true, required: true, args: [data("number", { min: 1, max: 10000, whole: true })] },
        tick: { kind: "decl", once: true, args: [data("number", { min: 0.001, max: 1 })] },
        seed: { kind: "decl", once: true, args: [data("number", { min: 0, whole: true })] },
        update: { kind: "decl", once: true, args: [lambda("update")] },
      },
      rejected: {
        collide: { message: "particles never see each other in this language, so there is no collide" },
      },
      check(record, ctx) {
        // Constants a lambda reads must be numbers; a top-level let is not a name a lambda has.
        for (const unit of record.units ?? []) {
          if (unit.keyword === "let") {
            ctx.error("R019", `a lambda may not use the top-level let '${unit.name}'`, { tip: `declare it with const ${unit.name} = …` });
          } else if (unit.keyword === "const" && unit.kind === "const" && !Number.isFinite(Number(unit.src.trim() || NaN))) {
            ctx.error("R019", `a lambda may use only top-level number constants, and '${unit.name}' is ${unit.src}`, { tip: "make it a finite number" });
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
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")] },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")] },
      },
      check(record, ctx) {
        checkName(record.emitter, ctx);
        const options = record.options ?? {};
        const bounds = ctx.program.bounds;
        // Only judge the position against a box that is itself legal: one mistake, one diagnostic.
        const side = (n) => typeof n === "number" && n >= 1 && n <= 4096;
        if (bounds && side(bounds.width) && side(bounds.height)) {
          const { x, y } = options;
          if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
            ctx.error("R014", `emitter '${record.emitter}' at (${x}, ${y}) is outside the bounds ${bounds.width} x ${bounds.height}`, { tip: "place it inside the box, edges included" });
          }
        }
        const forces = Array.isArray(options.forces) ? options.forces : [];
        const twice = forces.find((f, i) => forces.indexOf(f) !== i);
        if (twice !== undefined) {
          ctx.error("R016", `emitter '${record.emitter}' names the force '${twice}' twice`, { tip: "list each force once" });
        }
      },
    },
  },
});
