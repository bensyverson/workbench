import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";
import { checkLambda, worst } from "./particles.check.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const BUILT_IN = ["pos", "vel", "age", "life", "size", "kill"];

// Cross-checks, run once the export returns.
function check(record, ctx) {
  const error = (n, message) => ctx.error(`R${String(n).padStart(3, "0")}`, `[refusal ${n}] ${message}`);
  const named = (what, name) => {
    if (!NAME.test(name)) error(22, `the ${what} name '${name}' is not a letter followed by letters, digits or _`);
  };
  const emitters = record.emitter ?? [];
  named("program", record.name);
  for (const [what, key] of [["param", "params"], ["field", "fields"], ["counter", "counters"], ["force", "forces"]]) {
    for (const name of Object.keys(record[key] ?? {})) named(what, name);
  }
  for (const name of Object.keys(record.fields ?? {})) {
    if (BUILT_IN.includes(name)) error(9, `no field may be named '${name}': every particle already has it`);
  }
  for (const e of emitters) {
    named("emitter", e.emitter);
    if (e.options === undefined) continue; // the kit reports the missing argument (B004)
    const { x, y, forces } = e.options;
    const box = record.bounds;
    if (box && (x < 0 || x > box.width || y < 0 || y > box.height)) {
      error(14, `the emitter '${e.emitter}' at (${x}, ${y}) lies outside the bounds ${box.width} by ${box.height}`);
    }
    const twice = (forces ?? []).find((f, i) => forces.indexOf(f) !== i);
    if (twice !== undefined) error(16, `the emitter '${e.emitter}' names the force '${twice}' twice`);
  }
  // A refused lambda that calls a helper would leave the helper untyped (a second,
  // misleading L014), so such mistakes are reported here, before any lowering.
  const lambdas = [
    ...Object.entries(record.forces ?? {}).map(([n, src]) => ["force", `the force '${n}'`, src]),
    ...(record.update ? [["update", "update", record.update]] : []),
    ...emitters.flatMap((e) => ["rate", "spawn"].filter((k) => e[k]).map((k) => [k, `emitter '${e.emitter}' .${k}`, e[k]])),
  ];
  for (const [kind, label, source] of lambdas) {
    if (typeof source !== "string") continue; // the kit has already refused it
    const { problems, callsHelper } = checkLambda(kind, source, record, null);
    if (callsHelper && problems.length) {
      const { n, message } = worst(problems);
      ctx.error(`R${String(n).padStart(3, "0")}`, `${label}: ${message}`);
    }
  }
}

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      check,
      rejected: {
        collide: { message: "particles never see each other in this language, so there is no collide", fix: "delete .collide(…); particles meet only the bounds" },
      },
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        field: { kind: "decl", args: [name("field"), data({ value: "number" })], as: "fields" },
        counter: { kind: "decl", args: [name("counter")], as: "counters" },
        force: { kind: "decl", args: [name("force"), lambda("force")], as: "forces" },
        bounds: { kind: "decl", args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })], once: true, required: true },
        maxParticles: { kind: "decl", args: [data("number", { min: 1, max: 10000, whole: true })], once: true, required: true },
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        seed: { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [name("emitter"), data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) }, { as: "options" })],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
    },
  },
});
