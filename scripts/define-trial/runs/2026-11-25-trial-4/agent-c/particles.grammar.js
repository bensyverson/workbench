import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Checks the shapes cannot express: the identifier rule, whole numbers and ranges,
// and the cross-checks between options. Their codes use the particles letter, Q.
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];
const inRange = (n, lo, hi) => typeof n === "number" && n >= lo && n <= hi;

function checkName(n, ctx) {
  if (!IDENT.test(n)) ctx.error("Q009", `'${n}' is not a name: a letter, then letters, digits or _`, { arg: 0, tip: "start the name with a letter" });
}

const ParamShape = { value: "number", min: "number", max: "number" };
const BoundsShape = { width: "number", height: "number" };
const EmitterShape = { x: "number", y: "number", maxRate: "number", "forces?": listOf(ref("force")) };

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      rejected: {
        collide: { message: "particles never see each other, so there is no collide", tip: "give each particle its own behavior in a force, an update or a spawn" },
      },
      check(record, ctx) {
        if (!record.emitter || record.emitter.length === 0) {
          ctx.error("Q010", "the Program has no emitter", { tip: "add .emitter(name, { x, y, maxRate }) with a .rate and a .spawn" });
        }
      },
      slots: {
        param: {
          kind: "decl", args: [name("param"), data(ParamShape)], as: "params",
          check({ args: [n] }, ctx) { checkName(n, ctx); },
        },
        bounds: {
          kind: "decl", args: [data(BoundsShape)], once: true, required: true,
          check({ args: [b] }, ctx) {
            for (const k of ["width", "height"]) {
              if (!inRange(b[k], 1, 4096)) ctx.error("Q001", `bounds ${k} ${b[k]} is outside 1 to 4096`, { arg: [0, k] });
            }
          },
        },
        maxParticles: {
          kind: "decl", args: [data("number")], once: true, required: true,
          check({ args: [n] }, ctx) {
            if (!Number.isInteger(n) || !inRange(n, 1, 10000)) ctx.error("Q002", `maxParticles ${n} must be a whole number from 1 to 10000`, { arg: 0 });
          },
        },
        tick: {
          kind: "decl", args: [data("number")], once: true,
          check({ args: [n] }, ctx) {
            if (!inRange(n, 0.001, 1)) ctx.error("Q003", `tick ${n} is outside 0.001 to 1`, { arg: 0 });
          },
        },
        seed: {
          kind: "decl", args: [data("number")], once: true,
          check({ args: [n] }, ctx) {
            if (!Number.isInteger(n) || n < 0) ctx.error("Q004", `seed ${n} must be a whole number, 0 or more`, { arg: 0 });
          },
        },
        field: {
          kind: "decl", args: [name("field"), data({ value: "number" })],
          check({ args: [n] }, ctx) {
            checkName(n, ctx);
            if (RESERVED_FIELDS.includes(n)) ctx.error("Q008", `'${n}' is a built-in particle field`, { arg: 0, tip: "rename the field" });
          },
        },
        counter: {
          kind: "decl", args: [name("counter")],
          check({ args: [n] }, ctx) { checkName(n, ctx); },
        },
        force: {
          kind: "decl", args: [name("force"), lambda("force")],
          check({ args: [n] }, ctx) { checkName(n, ctx); },
        },
        update: { kind: "decl", args: [lambda("update")], once: true },
      },
    },
    emitter: {
      parent: "particles",
      opens: [name("emitter"), data(EmitterShape, { as: "at" })],
      check(record, ctx) {
        checkName(record.emitter, ctx);
        const { x, y, maxRate, forces = [] } = record.at;
        if (!(maxRate >= 0)) ctx.error("Q005", `emitter ${record.emitter}: maxRate ${maxRate} is negative`, { arg: [1, "maxRate"] });
        const b = ctx.program?.bounds;
        if (b && (x < 0 || x > b.width || y < 0 || y > b.height)) {
          ctx.error("Q006", `emitter ${record.emitter} at (${x}, ${y}) lies outside the bounds`, { arg: [1, "x"], tip: "move it inside (0, 0) to (width, height)" });
        }
        if (new Set(forces).size !== forces.length) ctx.error("Q007", `emitter ${record.emitter} lists a force twice`, { arg: [1, "forces"] });
      },
      slots: {
        rate: { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      },
    },
  },
});
