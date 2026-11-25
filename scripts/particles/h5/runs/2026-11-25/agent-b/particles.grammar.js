import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED = ["pos", "vel", "age", "life", "size", "kill"];

const checkName = (what) => (call, ctx) => {
  const n = call.args[0];
  if (typeof n === "string" && !NAME.test(n)) {
    ctx.error("E001", `${what} name '${n}' must be a letter followed by letters, digits or _`, { arg: 0, tip: "names look like 'flame', 'jet2' or 'burned_out'" });
  }
};

const num = (bounds) => data("number", bounds);

// The kit type-checks lambdas, but lets a few things through that this language
// does not have. These checks read the lambda's source text (what a slot check sees).
const RESERVED_BINDINGS = ["vec2", "length", "Math", "counters", "$"];
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const checkLambdaText = (call, ctx, opts = {}) => {
  const arg = call.args.length - 1;
  const raw = call.args[arg];
  if (typeof raw !== "string") return;
  const src = stripComments(raw);
  if (/["'`]/.test(src)) {
    ctx.error("E101", "this lambda has a string: the language has numbers, booleans and vec2 only", { arg, tip: "remove the string; names and labels belong in build code" });
    return;
  }
  if (/\*\*/.test(src)) {
    ctx.error("E102", "'**' is not in the language", { arg, tip: "multiply instead (x * x), or use Math.sqrt" });
    return;
  }
  const head = src.match(/^\s*\(([^)]*)\)\s*=>/) ?? src.match(/^\s*([A-Za-z_$][\w$]*)\s*=>/);
  const params = head ? head[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const locals = [...src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  for (const n of [...params, ...locals]) {
    if (RESERVED_BINDINGS.includes(n)) {
      ctx.error("E103", `a parameter or local may not be named '${n}': that name belongs to the language`, { arg, tip: "rename it" });
      return;
    }
  }
  if (opts.block) {
    const body = src.replace(/^\s*(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/, "");
    if (!body.startsWith("{")) {
      ctx.error("E104", `a ${opts.block} lambda has a block body { … } and gives no value`, { arg, tip: "wrap it in braces: (p, dt) => { … }" });
      return;
    }
  }
  if (opts.kill && params[0] && /^[A-Za-z_$][\w$]*$/.test(params[0])) {
    const P = params[0].replace(/\$/g, "\\$");
    const uses = [...src.matchAll(new RegExp(`\\b${P}\\s*\\.\\s*kill\\b`, "g"))].length;
    const statements = [...src.matchAll(new RegExp(`(?:^|[{};)]|\\belse)\\s*${P}\\s*\\.\\s*kill\\s*\\(\\s*\\)\\s*(?=;|})`, "g"))].length;
    if (uses !== statements) {
      ctx.error("E105", `'${params[0]}.kill' is a verb: write it only as the statement ${params[0]}.kill(); with no arguments and no value`, { arg, fix: `${params[0]}.kill();` });
      return;
    }
  }
};

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", as: "params",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          check(call, ctx) {
            checkName("a param")(call, ctx);
            const o = call.args[1];
            if (o && typeof o.min === "number" && typeof o.max === "number" && typeof o.value === "number") {
              if (o.min > o.max) ctx.error("E002", `param '${call.args[0]}' has min ${o.min} above max ${o.max}`, { arg: 1, tip: "min <= value <= max" });
              else if (o.value < o.min || o.value > o.max) ctx.error("E002", `param '${call.args[0]}' has value ${o.value} outside ${o.min}..${o.max}`, { arg: 1, tip: "the value must lie in min..max, ends included" });
            }
          },
        },
        bounds: {
          kind: "decl", once: true, required: true,
          args: [data({ width: num({ min: 1, max: 4096 }), height: num({ min: 1, max: 4096 }) })],
        },
        maxParticles: { kind: "decl", once: true, required: true, args: [num({ min: 1, max: 10000, whole: true })] },
        tick: { kind: "decl", once: true, args: [num({ min: 0.001, max: 1 })] },
        seed: { kind: "decl", once: true, args: [num({ min: 0, whole: true })] },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            checkName("a field")(call, ctx);
            const n = call.args[0];
            if (RESERVED.includes(n)) {
              ctx.error("E003", `a field may not be named '${n}': every particle already has pos, vel, age, life, size and the verb kill`, { arg: 0, tip: "pick another name, such as 'heat'" });
            }
          },
        },
        counter: { kind: "decl", args: [name("counter")], check: checkName("a counter") },
        force: { kind: "decl", args: [name("force"), lambda("force")], check(call, ctx) { checkName("a force")(call, ctx); checkLambdaText(call, ctx, { block: "force" }); } },
        update: { kind: "decl", once: true, args: [lambda("update")], check: (call, ctx) => checkLambdaText(call, ctx, { block: "update", kill: true }) },
      },
      rejected: {
        collide: { message: "particles never see each other in this language, so nothing collides", fix: "react to the bounds or a field inside .update(…)" },
      },
      check(record, ctx) {
        const b = Array.isArray(record.bounds) ? record.bounds[0] : record.bounds;
        for (const e of record.emitter ?? []) {
          const en = e.emitter ?? e.name;
          if (typeof en === "string" && !NAME.test(en)) {
            ctx.error("E001", `an emitter name '${en}' must be a letter followed by letters, digits or _`, { tip: "names look like 'flame', 'jet2' or 'burned_out'" });
          }
          const at = e.at ?? {};
          const boxOk = b && typeof b.width === "number" && typeof b.height === "number" &&
            b.width >= 1 && b.width <= 4096 && b.height >= 1 && b.height <= 4096;
          if (boxOk && typeof at.x === "number" && typeof at.y === "number" &&
              (at.x < 0 || at.x > b.width || at.y < 0 || at.y > b.height)) {
            ctx.error("E004", `emitter '${en}' at (${at.x}, ${at.y}) lies outside the bounds (0, 0) to (${b.width}, ${b.height})`, { tip: "place the emitter inside the box, edges included" });
          }
          const fs = at.forces ?? [];
          const seen = new Set();
          for (const f of fs) {
            if (seen.has(f)) ctx.error("E005", `emitter '${en}' lists force '${f}' twice`, { tip: "name each force once; forces run in declaration order anyway" });
            seen.add(f);
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [
        name("emitter"),
        data({ x: "number", y: "number", maxRate: num({ min: 0 }), "forces?": listOf(ref("force")) }, { as: "at" }),
      ],
      slots: {
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")], check: checkLambdaText },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")], check: (call, ctx) => checkLambdaText(call, ctx, { block: "spawn" }) },
      },
    },
  },
});
