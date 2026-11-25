import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const BUILTIN = ["pos", "vel", "age", "life", "size", "kill"];

function checkName(n, ctx, what) {
  if (typeof n === "string" && !NAME.test(n)) {
    ctx.error("R022", `the ${what} name '${n}' must be a letter followed by letters, digits or _`,
      { arg: 0, tip: "names are a letter, then letters, digits or _" });
    return false;
  }
  return true;
}

const num = (opts) => data("number", opts);

// Checks the kit's lambda checker does not make, read from the lambda's source text.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// Does a block's statement list return on every path? A small structural reading of
// the Runtime Subset: return; if/else; nested blocks; for loops and other statements
// do not count as returning.
function matchClose(s, i) {           // s[i] is ( or {; index of its partner
  const open = s[i], close = open === "(" ? ")" : "}";
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return j;
  }
  return s.length;
}
function skipWs(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }
// parse one statement at i; returns { end, returns }
function statement(s, i) {
  i = skipWs(s, i);
  if (s[i] === "{") { const j = matchClose(s, i); return { end: j + 1, returns: block(s.slice(i + 1, j)) }; }
  const word = /^[A-Za-z_$][\w$]*/.exec(s.slice(i))?.[0];
  if (word === "if") {
    const c = matchClose(s, skipWs(s, i + 2));
    const then = statement(s, c + 1);
    const k = skipWs(s, then.end);
    if (s.slice(k, k + 4) === "else" && !/[\w$]/.test(s[k + 4] ?? "")) {
      const other = statement(s, k + 4);
      return { end: other.end, returns: then.returns && other.returns };
    }
    return { end: then.end, returns: false };
  }
  if (word === "for" || word === "while") {
    const c = matchClose(s, skipWs(s, i + word.length));
    return { end: statement(s, c + 1).end, returns: false };
  }
  // a simple statement: up to ; at depth 0 (or end)
  let j = i, depth = 0;
  for (; j < s.length; j++) {
    const ch = s[j];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === ";" && depth === 0) break;
  }
  return { end: j + 1, returns: word === "return" };
}
function block(s) {
  let i = 0, returns = false;
  while (skipWs(s, i) < s.length) {
    const st = statement(s, i);
    if (st.returns) returns = true;
    if (st.end <= i) break;
    i = st.end;
  }
  return returns;
}

function checkLambdaSource(src, ctx, arg, kind) {
  if (typeof src !== "string") return true;
  const code = stripComments(src);
  if (/\.\s*collide\b/.test(code)) {
    ctx.error("R020", "particles never see each other in this language, so there is no collide",
      { arg, tip: "keep per-particle state in a .field and react to it in .update" });
    return false;
  }
  if (/\bMath\s*\.\s*random\b/.test(code)) {
    ctx.error("R019", "Math.random is not available: randomness comes from spawn's rng(), kept in a .field if update needs it later",
      { arg, tip: "call rng() inside spawn and store the number in a field", fix: "rng()" });
    return false;
  }
  const arrow = code.indexOf("=>");
  const head = arrow >= 0 ? code.slice(0, arrow) : "";
  if (kind !== "spawn" && /(^|[^\w$.])rng(?![\w$])/.test(code)) {
    ctx.error("R007", `the name rng means nothing in ${kind === "update" ? "an" : "a"} ${kind} lambda: rng() is called only inside spawn`,
      { arg, tip: "draw random numbers in spawn with rng() and keep them in a .field if needed later" });
    return false;
  }
  const params = head.replace(/[()]/g, " ").split(",").map((s) => s.trim()).filter(Boolean);
  const locals = [...code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const reserved = [...params, ...locals].find((n) => ["vec2", "length", "Math", "counters", "$"].includes(n));
  if (reserved) {
    ctx.error("R021", `no local or parameter may be named '${reserved}': that name belongs to the language`,
      { arg, tip: "rename it" });
    return false;
  }
  if (kind === "update" && params[0] && /^[A-Za-z_$][\w$]*$/.test(params[0])) {
    const p = params[0].replace(/\$/g, "\\$");
    const uses = [...code.matchAll(new RegExp(`(^|[^\\w$.])${p}\\s*\\.\\s*kill\\b`, "g"))];
    const stmt = new RegExp(`(?:^|[;{}]|\\)|\\belse)\\s*$`);
    for (const m of uses) {
      const before = code.slice(0, m.index + m[1].length);
      const after = code.slice(m.index + m[0].length);
      if (stmt.test(before) && /^\s*\(\s*\)\s*(;|}|$)/.test(after)) continue;
      if (/^\s*\(/.test(after) && !/^\s*\(\s*\)/.test(after)) continue;   // wrong arguments: the kit says so
      if (!/^\s*\(/.test(after)) continue;                              // bare p.kill: the kit says so
      ctx.error("R009", `${params[0]}.kill() is a statement on its own, with no value: write \`${params[0]}.kill();\``,
        { arg, tip: "call it as its own statement", fix: `${params[0]}.kill();` });
      return false;
    }
  }
  if (/["'`]/.test(code)) {
    ctx.error("R021", "lambdas have no strings", { arg, tip: "use numbers, booleans and vec2 only" });
    return false;
  }
  if (/\*\*/.test(code)) {
    ctx.error("R021", "lambdas have no '**' operator", { arg, tip: "multiply out, or use Math.sqrt", fix: "x * x" });
    return false;
  }
  if (kind === "rate" && arrow >= 0) {
    const body = code.slice(arrow + 2).trim();
    if (body.startsWith("{")) {
      const close = matchClose(body, 0);
      if (!block(body.slice(1, close))) {
        ctx.error("R011", "a rate lambda gives a number on every path, but this one can reach its end without a return",
          { arg, tip: "add a return of a number on every path (for example a final `return 0;`)" });
        return false;
      }
    }
  }
  if (kind !== "rate") {
    const at = arrow;
    if (at >= 0 && !code.slice(at + 2).trimStart().startsWith("{")) {
      ctx.error("R011", `${kind === "update" ? "an" : "a"} ${kind} lambda has a block body { … } and returns no value; this one has an expression body`,
        { arg, tip: "wrap the body in braces as a statement", fix: "(p, …) => { …; }" });
      return false;
    }
  }
  return true;
}

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
            if (!checkName(call.args[0], ctx, "param")) return;
            const o = call.args[1];
            if (o && !(o.min <= o.value && o.value <= o.max)) {
              ctx.error("R022", `param '${call.args[0]}' needs min <= value <= max (got value ${o.value}, min ${o.min}, max ${o.max})`,
                { arg: 1, tip: "pick a value inside min..max, or widen the range" });
            }
          },
        },
        bounds: {
          kind: "decl", once: true, required: true,
          args: [data({ width: num({ min: 1, max: 4096 }), height: num({ min: 1, max: 4096 }) })],
        },
        maxParticles: {
          kind: "decl", once: true, required: true,
          args: [num({ min: 1, max: 10000, whole: true })],
        },
        tick: { kind: "decl", once: true, args: [num({ min: 0.001, max: 1 })] },
        seed: { kind: "decl", once: true, args: [num({ min: 0, whole: true })] },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          check(call, ctx) {
            const n = call.args[0];
            if (!checkName(n, ctx, "field")) return;
            if (BUILTIN.includes(n)) {
              ctx.error("R009", `a field may not be.emitterd '${n}': every particle already has pos, vel, age, life, size and the verb kill`,
                { arg: 0, tip: "choose another name for your field" });
            }
          },
        },
        counter: {
          kind: "decl",
          args: [name("counter")],
          check(call, ctx) { checkName(call.args[0], ctx, "counter"); },
        },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          check(call, ctx) {
            if (checkName(call.args[0], ctx, "force")) checkLambdaSource(call.args[1], ctx, 1, "force");
          },
        },
        update: {
          kind: "decl", once: true, args: [lambda("update")],
          check(call, ctx) { checkLambdaSource(call.args[0], ctx, 0, "update"); },
        },
      },
      rejected: {
        collide: {
          message: "particles never see each other in this language, so there is no collide",
          fix: "keep per-particle state in a .field and react to it in .update",
        },
      },
      check(record, ctx) {
        const b = record.bounds;
        const boundsOk = b && b.width >= 1 && b.width <= 4096 && b.height >= 1 && b.height <= 4096;
        const emitters = record.emitter ?? [];
        for (const e of emitters) {
          const o = e.opts ?? {};
          if (typeof e.emitter === "string" && !NAME.test(e.emitter)) {
            ctx.error("R022", `the emitter name '${e.emitter}' must be a letter followed by letters, digits or _`,
              { tip: "names are a letter, then letters, digits or _" });
          }
          if (boundsOk && typeof o.x === "number" && typeof o.y === "number" &&
              (o.x < 0 || o.x > b.width || o.y < 0 || o.y > b.height)) {
            ctx.error("R014", `emitter '${e.emitter}' at (${o.x}, ${o.y}) lies outside the bounds (0, 0) to (${b.width}, ${b.height})`,
              { tip: "place the emitter inside the box, edges included" });
          }
          if (Array.isArray(o.forces)) {
            const seen = new Set();
            for (const f of o.forces) {
              if (seen.has(f)) {
                ctx.error("R016", `emitter '${e.emitter}' lists force '${f}' twice`,
                  { tip: "name each force once; forces always run in declaration order" });
              }
              seen.add(f);
            }
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [
        name("emitter"),
        data({ x: "number", y: "number", maxRate: num({ min: 0 }), "forces?": listOf(ref("force")) }, { as: "opts" }),
      ],
      slots: {
        rate: {
          kind: "decl", once: true, required: true, args: [lambda("rate")],
          check(call, ctx) { checkLambdaSource(call.args[0], ctx, 0, "rate"); },
        },
        spawn: {
          kind: "decl", once: true, required: true, args: [lambda("spawn")],
          check(call, ctx) { checkLambdaSource(call.args[0], ctx, 0, "spawn"); },
        },
      },
    },
  },
});
