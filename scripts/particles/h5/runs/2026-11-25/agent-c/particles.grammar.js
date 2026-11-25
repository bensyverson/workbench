import { data, defineGrammar, lambda, listOf, name, ref } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
// The kit refuses most non-names itself; these are the ones it takes and particles does not.
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function named(ctx, kind, value, arg) {
  if (IDENTIFIER.test(value) && !NAME.test(value)) ctx.error("R022", `${kind === "emitter" ? "an" : "a"} ${kind} name is a letter followed by letters, digits or _; '${value}' is not`, { arg });
}

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      check(record, ctx) { named(ctx, "particle system", record.name, 0); },
      slots: {
        param: {
          kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params",
          check(call, ctx) {
            const [param, { value, min, max }] = call.args;
            named(ctx, "param", param, 0);
            if (!(min <= value && value <= max)) ctx.error("R022", `param '${param}' needs min <= value <= max, not value ${value} with ${min}..${max}`, { arg: 1 });
          },
        },
        field: {
          kind: "decl", args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            const [field] = call.args;
            named(ctx, "field", field, 0);
            if (["pos", "vel", "age", "life", "size", "kill"].includes(field)) ctx.error("R009", `a field may not be named '${field}': every particle already has pos, vel, age, life, size and kill`, { arg: 0 });
          },
        },
        counter: { kind: "decl", args: [name("counter")], check(call, ctx) { named(ctx, "counter", call.args[0], 0); } },
        force: { kind: "decl", args: [name("force"), lambda("force")], check(call, ctx) { named(ctx, "force", call.args[0], 0); } },
        bounds: { kind: "decl", args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })], once: true, required: true },
        maxParticles: { kind: "decl", args: [data("number", { min: 1, max: 10000, whole: true })], once: true, required: true },
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        seed: { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
      rejected: { collide: { message: "particles never see each other in this language", fix: "remove .collide(…)" } },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [name("emitter"), data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) })],
      check(record, ctx) {
        const { x, y, forces = [] } = record.arg1;
        named(ctx, "emitter", record.emitter, 0);
        const bounds = ctx.program.bounds;
        const side = (n) => n >= 1 && n <= 4096;
        if (bounds && side(bounds.width) && side(bounds.height) && !(x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height)) {
          ctx.error("R014", `emitter '${record.emitter}' is at (${x}, ${y}), outside the bounds ${bounds.width} by ${bounds.height}`, { arg: 1 });
        }
        const twice = forces.find((f, k) => forces.indexOf(f) !== k);
        if (twice !== undefined) ctx.error("R016", `emitter '${record.emitter}' lists the force '${twice}' twice`, { arg: 1 });
      },
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
    },
  },
});
