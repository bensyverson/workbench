import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect, BUILTIN_FIELDS } from "./particles.dialect.js";

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const isWhole = (n) => Number.isInteger(n);

/** A builder check that `n` lies in lo..hi (and is whole if asked). */
const range = (what, lo, hi, whole) => ({ args: [n] }, ctx) => {
  if (whole && !isWhole(n)) ctx.error("R001", `${what} must be a whole number, not ${n}`, { arg: 0, tip: `write ${Math.round(n)}` });
  if (n < lo || n > hi) ctx.error("R002", `${what} ${n} lies outside ${lo} to ${hi === Infinity ? "any" : hi}`, { arg: 0, tip: `pick a ${what} in ${lo}..${hi}` });
};

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      rejected: {
        collide: {
          message: "particles never see each other in this language",
          tip: "keep what a particle needs in its own fields; there is no collision",
        },
      },
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        bounds: {
          kind: "decl", args: [data({ width: "number", height: "number" })], once: true, required: true,
          check({ args: [b] }, ctx) {
            for (const k of ["width", "height"]) {
              if (b[k] < 1 || b[k] > 4096) ctx.error("R002", `bounds ${k} ${b[k]} lies outside 1 to 4096`, { arg: [0, k], tip: `pick a ${k} in 1..4096` });
            }
          },
        },
        maxParticles: { kind: "decl", args: [data("number")], once: true, required: true, check: range("maxParticles", 1, 10000, true) },
        tick: { kind: "decl", args: [data("number")], once: true, check: range("tick", 0.001, 1, false) },
        seed: { kind: "decl", args: [data("number")], once: true, check: range("seed", 0, Infinity, true) },
        field: {
          kind: "decl", args: [name("field"), data({ value: "number" })], as: "fields",
          check({ args: [n] }, ctx) {
            if (BUILTIN_FIELDS.includes(n)) ctx.error("R003", `field '${n}' is named like the particle's built-in '${n}'`, { arg: 0, tip: "rename the field" });
          },
        },
        counter: { kind: "decl", args: [name("counter")], as: "counters" },
        force: { kind: "decl", args: [name("force"), lambda("force")], as: "forces" },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
      check(record, ctx) {
        // The sheet: lambdas read top-level constants, not a top-level let (the host says each binding's keyword).
        for (const u of record.units ?? []) {
          if (u.keyword === "let") ctx.error("R009", `the top-level '${u.name}' is a let, which a lambda may not read`, { tip: `write const ${u.name} = …` });
        }
        if (Object.keys(record.fields ?? {}).length > 64) ctx.error("R010", "a particle carries at most 64 fields", { tip: "use fewer .field calls" });
        const emitters = record.emitter ?? [];
        if (emitters.length === 0) ctx.error("R004", "the Program has no emitter", { tip: 'add .emitter("jet", { x, y, maxRate }) with .rate and .spawn' });
        // Two emitters with one name are the kit's B002: an opening name() declares into the "emitter" namespace.
        for (const e of emitters) {
          const b = record.bounds;
          if (b && (e.opts.x < 0 || e.opts.x > b.width || e.opts.y < 0 || e.opts.y > b.height)) {
            ctx.error("R006", `emitter '${e.name}' at (${e.opts.x}, ${e.opts.y}) lies outside the bounds ${b.width} x ${b.height}`, { tip: "move it inside the box" });
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      opens: [name(), data({ x: "number", y: "number", maxRate: "number", "forces?": listOf(ref("force")), "on?": ref("in", { kind: "event" }), "count?": "number", "follow?": ref("in", { kind: "value" }) }, { as: "opts" })],
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
      check(record, ctx) {
        if (!IDENT.test(record.name)) ctx.error("R007", `emitter name '${record.name}' is not a letter followed by letters, digits or _`, { tip: "rename it" });
        if (record.opts.maxRate < 0) ctx.error("R002", `emitter '${record.name}': maxRate ${record.opts.maxRate} is negative`, { tip: "use a maxRate of 0 or more" });
        const fs = record.opts.forces ?? [];
        const dup = fs.find((f, i) => fs.indexOf(f) !== i);
        if (dup !== undefined) ctx.error("R008", `emitter '${record.name}' lists force '${dup}' twice`, { tip: "list each force once" });
        const { on, count, follow } = record.opts;
        if (count !== undefined) {
          if (on === undefined) ctx.error("R011", `emitter '${record.name}' has a count but no on: count is the particles made per record`, { tip: 'add on: "burst", or drop count' });
          if (!isWhole(count) || count < 1 || count > 10000) ctx.error("R002", `emitter '${record.name}': count ${count} is not a whole number in 1 to 10000`, { tip: "pick a count in 1..10000" });
        }
        if (follow !== undefined && follow !== "anchor") ctx.error("R012", `emitter '${record.name}' cannot follow '${follow}', which is not a position`, { tip: 'write follow: "anchor"' });
      },
    },
  },
});
