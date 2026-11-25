import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesLang } from "./particles.dialect.js";

// Error codes: T0nn is refusal nn of the particles sheet.

const BUILT_IN_FIELDS = ["pos", "vel", "age", "life", "size", "kill"];
const RESERVED = ["vec2", "length", "Math", "counters", "$"];
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const COLLIDE = {
  message: "particles never see each other in this language, so there is no collide (20)",
  tip: "remove the collide call: particles do not interact",
};

// ---------------------------------------------------------------------------
// A small source lint for what the kit's runtime subset allows but the
// particles language does not (strings, arrays, object literals, `**`,
// reserved local names, `rng` outside spawn, helpers that assign).

const PUNCT = [
  ">>>=", "===", "!==", "**=", "<<=", ">>=", ">>>", "...",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "**", "<<", ">>",
  "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^",
  "!", "~", "?", ":", "=", ".",
];
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^="]);

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out.push({ t: "str", v: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    const num = /^(\d[\d_]*\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?)/i.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (p) { out.push({ t: "p", v: p }); i += p.length; continue; }
    out.push({ t: "p", v: c });
    i++;
  }
  return out;
}

function paramsOf(toks) {
  if (toks[0]?.v === "(") {
    const names = [];
    let depth = 0;
    for (let k = 0; k < toks.length; k++) {
      const tk = toks[k];
      if (tk.v === "(" || tk.v === "[" || tk.v === "{") depth++;
      else if (tk.v === ")" || tk.v === "]" || tk.v === "}") { depth--; if (depth === 0) break; }
      else if (depth === 1 && tk.t === "id" && (toks[k - 1].v === "(" || toks[k - 1].v === ",")) names.push(tk.v);
    }
    return names;
  }
  return toks[0]?.t === "id" ? [toks[0].v] : [];
}

const BLOCK_BEFORE = new Set(["=>", ")", ";", "{", "}", "else", "do"]);

// kind: "rate" | "spawn" | "force" | "update" | "helper"
function lint(src, kind, label) {
  const toks = tokenize(src);
  const errs = [];
  const err = (code, message, extra = {}) => {
    if (errs.some((e) => e.code === code)) return; // one diagnostic per kind of mistake per lambda
    errs.push({ code, message: `${label}: ${message}`, ...extra });
  };
  const params = paramsOf(toks);
  for (const pn of params) {
    if (pn === "rng" && kind === "helper") {
      err("T007", "a helper may not take 'rng': randomness is called only inside a spawn lambda (7)", { tip: "call rng() in spawn and pass the number in" });
    } else if (pn === "rng" && kind !== "spawn") {
      err("T007", `the name rng means nothing in a ${kind} lambda: rng() exists only in spawn (7)`, { tip: "draw the number in spawn with rng() and keep it in a field if update needs it later" });
    } else if (RESERVED.includes(pn)) {
      err("T021", `a parameter may not be named '${pn}': that name belongs to the language (21)`, { tip: "rename the parameter" });
    }
  }
  if (kind === "spawn" || kind === "force" || kind === "update") {
    const p0 = params[0];
    for (let k = 0; p0 && k + 5 < toks.length; k++) {
      if (toks[k].v === p0 && toks[k - 1]?.v !== "." && toks[k + 1].v === "." && toks[k + 2].v === "age" &&
          toks[k + 3].v === "." && (ASSIGN_OPS.has(toks[k + 5].v) || toks[k + 5].v === "++" || toks[k + 5].v === "--")) {
        err("T004", "age is written only by the host, never by a lambda (4)", { tip: "read p.age; keep your own clock in a field" });
      }
    }
  }
  if (mixedTernary(toks)) {
    err("T012", "the arms of a ternary are a boolean and a number or vector: both arms need one type (12)", { tip: "give both arms one type" });
  }
  const lets = new Set();
  let start = 0;
  { let depth = 0; for (let k = 0; k < toks.length; k++) {
    const v = toks[k].v;
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") depth--;
    else if (v === "=>" && depth === 0) { start = k + 1; break; }
  } }
  for (let k = start; k < toks.length; k++) {
    const tk = toks[k];
    const prev = toks[k - 1];
    const next = toks[k + 1];
    if (tk.t === "str") { err("T021", `strings are not in the particles language: ${tk.v} (21)`, { tip: "use numbers, booleans and vec2 only" }); continue; }
    if (tk.v === "**" || tk.v === "**=") { err("T021", "'**' is not in the particles language (21)", { tip: "multiply it out, x * x, or use Math.sqrt" }); continue; }
    if (tk.v === "[") {
      // skip to the matching ]
      const open = k;
      for (let depth = 0; k < toks.length; k++) {
        if (toks[k].v === "[") depth++;
        else if (toks[k].v === "]" && --depth === 0) break;
      }
      if (prev?.v === "counters" && toks[open - 2]?.v !== ".") {
        err("T025", "counters is used only as counters.name (25)", { fix: "counters.burnedOut" });
        continue;
      }
      err("T021", prev && (prev.t === "id" || prev.v === ")" || prev.v === "]")
        ? "computed access (x[…]) is not in the particles language (21)"
        : "arrays are not in the particles language (21)", { tip: "name the member directly: p.vel, $.rate" });
      continue;
    }
    if (tk.v === "{" && prev && !BLOCK_BEFORE.has(prev.v)) {
      err("T021", "object literals are not in the particles language (21)", { tip: "use numbers, booleans and vec2(x, y)" });
      continue;
    }
    if ((tk.v === "let" || tk.v === "const") && next?.t === "id") {
      if (RESERVED.includes(next.v)) err("T021", `a local may not be named '${next.v}': that name belongs to the language (21)`, { tip: "rename the local" });
      if (next.v === "rng" && kind !== "spawn") err("T007", `the name rng means nothing outside a spawn lambda (7)`, { tip: "rename the local" });
      if (tk.v === "let") lets.add(next.v);
      continue;
    }
    // A bare `rng` outside spawn is not a name there: the kit refuses it (B013/B008).
    if (kind === "helper" && tk.t === "id" && tk.v === "counters" && prev?.v !== ".") {
      err("T024", "a helper never touches a counter (24)", { tip: "read counters only in a rate lambda; bump them only in spawn or update" });
      continue;
    }
    if (tk.v === "kill" && prev?.v === ".") {
      if (kind === "helper") {
        err("T006", "a helper may not kill a particle: p.kill(); belongs only in update (6)", { tip: "return a boolean and call p.kill(); in update" });
        continue;
      }
      if (kind === "spawn" || kind === "force") {
        err("T006", `p.kill(); belongs only in update, not in a ${kind} lambda (6)`, { tip: "kill the particle in update, or give it a short life" });
        continue;
      }
      if (kind === "update") {
        const owner = toks[k - 2];
        const before = toks[k - 3];
        const stmtStart = !before || BLOCK_BEFORE.has(before.v);
        const ok = owner?.t === "id" && stmtStart && next?.v === "(" && toks[k + 2]?.v === ")" &&
          (toks[k + 3]?.v === ";" || toks[k + 3]?.v === "}" || toks[k + 3] === undefined);
        if (!ok && next?.v === "(" && toks[k + 2]?.v === ")") {
          err("T009", "kill is a statement on its own, p.kill();, never a value (9)", { tip: "write p.kill(); as its own statement" });
        }
      }
      continue;
    }
    // assignments: in a helper (8) or a rate (1), only the lambda's own let locals.
    if (kind === "helper" || kind === "rate") {
      let root = null;
      if (tk.t === "p" && ASSIGN_OPS.has(tk.v)) {
        let j = k - 1;
        while (j >= 2 && toks[j].t === "id" && toks[j - 1].v === ".") j -= 2;
        if (toks[j]?.t === "id" && !(toks[j - 1] && (toks[j - 1].v === "let" || toks[j - 1].v === "const"))) root = toks[j].v;
      } else if (tk.v === "++" || tk.v === "--") {
        if (prev?.t === "id") {
          let j = k - 1;
          while (j >= 2 && toks[j].t === "id" && toks[j - 1].v === ".") j -= 2;
          root = toks[j].v;
        } else if (next?.t === "id") root = next.v;
      }
      if (root !== null && root !== "counters") {
        if (!lets.has(root)) {
          if (kind === "helper") {
            err("T008", `a helper is pure: it assigns only its own let locals, not '${root}' (8)`, { tip: "return the new value and assign it in the lambda that calls the helper" });
          } else {
            err("T001", `a rate lambda is pure: it assigns only its own let locals, not '${root}' (1)`, { tip: "compute the value in a let local and return it" });
          }
        }
      }
    }
  }
  return errs;
}

// A force writes only p.vel: refuse a write into part of another field
// (p.pos.x = 0), which the kit would call a vector-component write (3 over 5).
function forceFieldParts(src, knownFields) {
  const toks = tokenize(src);
  const p = paramsOf(toks)[0];
  if (!p) return null;
  for (let k = 0; k + 5 < toks.length; k++) {
    if (toks[k].v !== p || toks[k - 1]?.v === "." || toks[k + 1].v !== "." || toks[k + 3].v !== ".") continue;
    const f = toks[k + 2].v;
    const after = toks[k + 5];
    const assigns = ASSIGN_OPS.has(after.v) || after.v === "++" || after.v === "--" || toks[k - 1]?.v === "++" || toks[k - 1]?.v === "--";
    if (assigns && f !== "vel" && f !== "age" && knownFields.includes(f)) return f;
  }
  return null;
}

const BOOL_OPS = new Set(["<", ">", "<=", ">=", "===", "!==", "&&", "||", "!"]);

// The kind of a token run: "bool", "value" or null (unknown).
function kindOf(expr) {
  if (expr.length === 0) return null;
  let depth = 0;
  const top = [];
  for (const tk of expr) {
    if (tk.v === "(" || tk.v === "[" || tk.v === "{") depth++;
    else if (tk.v === ")" || tk.v === "]" || tk.v === "}") depth--;
    else if (depth === 0) top.push(tk);
  }
  if (top.some((tk) => tk.v === "?")) return null;
  if ((expr.length === 1 && (expr[0].v === "true" || expr[0].v === "false")) ||
      top.some((tk) => tk.t === "p" && BOOL_OPS.has(tk.v))) return "bool";
  if (expr.length === 1 && expr[0].t === "id") return null;
  if (expr[0].t === "num" || expr[0].v === "vec2" || top.some((tk) => ["+", "-", "*", "/", "%"].includes(tk.v))) return "value";
  return null;
}

// A ternary whose arms are a boolean and a number or vector (12).
function mixedTernary(toks) {
  for (let q = 0; q < toks.length; q++) {
    if (toks[q].v !== "?") continue;
    let depth = 0, c = -1, nested = 0;
    for (let j = q + 1; j < toks.length; j++) {
      const v = toks[j].v;
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") { if (depth === 0) break; depth--; }
      else if (depth === 0 && v === "?") nested++;
      else if (depth === 0 && v === ":") { if (nested === 0) { c = j; break; } nested--; }
    }
    if (c < 0) continue;
    const b = [];
    depth = 0;
    for (let j = c + 1; j < toks.length; j++) {
      const v = toks[j].v;
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") { if (depth === 0) break; depth--; }
      else if (depth === 0 && (v === ";" || v === "," || v === "?" || v === ":")) break;
      b.push(toks[j]);
    }
    const ka = kindOf(toks.slice(q + 1, c));
    const kb = kindOf(b);
    if (ka && kb && ka !== kb) return true;
  }
  return false;
}

// A helper whose returns give a boolean on one path and a number or vector on
// another (12). The kit catches number-vs-vector; this catches bool-vs-value.
function mixedReturns(src) {
  const toks = tokenize(src);
  const kinds = new Set();
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].v !== "return") continue;
    const expr = [];
    for (let j = k + 1, depth = 0; j < toks.length; j++) {
      const v = toks[j].v;
      if (depth === 0 && (v === ";" || v === "}")) break;
      if (v === "(" || v === "[" || v === "{") depth++;
      if (v === ")" || v === "]" || v === "}") depth--;
      expr.push({ ...toks[j], depth });
    }
    if (expr.length === 0) continue;
    const top = expr.filter((tk) => tk.depth === 0);
    if (top.some((tk) => tk.v === "?")) continue;
    const isBool = (expr.length === 1 && (expr[0].v === "true" || expr[0].v === "false")) ||
      top.some((tk) => tk.t === "p" && BOOL_OPS.has(tk.v));
    if (isBool) kinds.add("bool");
    else if (expr.length === 1 && expr[0].t === "id") continue; // a bare name: unknown
    else kinds.add("value");
  }
  return kinds.size > 1;
}

const srcOf = (fn) => (typeof fn === "function" ? fn.toString() : String(fn));

function lintCheck(kind, argIndex, labelOf) {
  return function check(call, ctx) {
    for (const e of lint(srcOf(call.args[argIndex]), kind, labelOf(call))) {
      const { code, message, ...rest } = e;
      ctx.error(code, message, { arg: argIndex, ...rest });
    }
  };
}

function nameCheck(kindWord) {
  return (n, ctx) => {
    // The kit already refuses what is not a JS identifier (B004); refuse the rest here.
    if (typeof n === "string" && /^[A-Za-z_$][\w$]*$/.test(n) && !NAME_RE.test(n)) {
      ctx.error("T022", `'${n}' is not a ${kindWord} name: a name is a letter, then letters, digits or _ (22)`, {
        arg: 0, tip: "for example 'flame2' or 'big_jet'",
      });
      return false;
    }
    return true;
  };
}

// A number expression of literals and other constants (top-level `const NAME = …`).
function isNumberExpr(src, constNames) {
  const toks = tokenize(src);
  if (toks.length === 0) return false;
  return toks.every((tk) => tk.t === "num" || (tk.t === "id" && constNames.has(tk.v)) ||
    (tk.t === "p" && ["+", "-", "*", "/", "%", "(", ")"].includes(tk.v)));
}

export const particles = defineGrammar(particlesLang, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            if (!nameCheck("param")(call.args[0], ctx)) return;
            const { value, min, max } = call.args[1];
            if (!(min <= value && value <= max)) {
              ctx.error("T022", `param '${call.args[0]}' has value ${value} outside its range ${min}..${max} (22)`, {
                arg: 1, tip: "a param needs min <= value <= max",
              });
            }
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            if (BUILT_IN_FIELDS.includes(call.args[0])) {
              ctx.error("T009", `a field may not be named '${call.args[0]}': every particle already has pos, vel, age, life, size and the verb kill (9)`, {
                arg: 0, tip: "pick another name, such as 'heat'",
              });
              return;
            }
            nameCheck("field")(call.args[0], ctx);
          },
        },
        counter: {
          kind: "decl", args: [name("counter")], as: "counters",
          check(call, ctx) { nameCheck("counter")(call.args[0], ctx); },
        },
        force: {
          kind: "decl", args: [name("force"), lambda("force")], as: "forces",
          check(call, ctx) {
            if (!nameCheck("force")(call.args[0], ctx)) return;
            const known = ["pos", "life", "size", ...Object.keys(ctx.program?.fields ?? {})];
            const f = forceFieldParts(srcOf(call.args[1]), known);
            if (f) {
              ctx.error("T003", `the force '${call.args[0]}' writes part of p.${f}: a force writes only p.vel (3)`, {
                arg: 1, tip: "change the particle's velocity, p.vel = …, and move other writes to update",
              });
              return;
            }
            lintCheck("force", 1, (c) => `the force '${c.args[0]}'`)(call, ctx);
          },
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
          kind: "decl", args: [data("number", { min: 1, max: 10000, whole: true })], once: true, required: true,
        },
        tick: { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
        seed: { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
        update: {
          kind: "decl", args: [lambda("update")], once: true,
          check: lintCheck("update", 0, () => "the update lambda"),
        },
      },
      rejected: { collide: COLLIDE },
      check(record, ctx) {
        // Top-level helpers and constants the lambdas may use.
        const units = record.units ?? [];
        const constNames = new Set();
        const helperSrcs = new Map();
        for (const u of units) {
          if (u.keyword === "let") {
            ctx.error("T019", `a lambda reads '${u.name}', a top-level let: lambdas see only top-level number constants and helpers (19)`, {
              fix: `const ${u.name} = …;`,
            });
            continue;
          }
          if (u.kind === "const") {
            if (!isNumberExpr(u.src, constNames)) {
              ctx.error("T019", `a lambda reads '${u.name}', a top-level constant that is not a number: lambdas see only number constants (19)`, {
                tip: "write the number into the lambda, or make the constant a number",
              });
            }
            constNames.add(u.name);
            continue;
          }
          if (u.kind === "fn") {
            helperSrcs.set(u.src.trim(), u.name);
            if (RESERVED.includes(u.name)) {
              ctx.error("T021", `a helper may not be named '${u.name}': that name belongs to the language (21)`, { tip: "rename the helper" });
            }
            if (mixedReturns(u.src)) {
              ctx.error("T012", `the helper '${u.name}' returns a boolean on one path and a number or vector on another (12)`, {
                tip: "return one type on every path",
              });
            }
            for (const e of lint(u.src, "helper", `the helper '${u.name}'`)) {
              const { code, message, ...rest } = e;
              ctx.error(code, message, rest);
            }
          }
        }
        // Every lambda slot takes an arrow written in place, not a helper's name.
        const lambdas = [];
        for (const [n, src] of Object.entries(record.forces ?? {})) lambdas.push([`force '${n}'`, src]);
        if (record.update) lambdas.push(["update", record.update]);
        for (const e of record.emitter ?? []) {
          const en = e.emitter ?? e.name;
          if (e.rate) lambdas.push([`${en}.rate`, e.rate]);
          if (e.spawn) lambdas.push([`${en}.spawn`, e.spawn]);
        }
        for (const [where, src] of lambdas) {
          const s = srcOf(Array.isArray(src) ? src[0] : src).trim();
          if (helperSrcs.has(s)) {
            ctx.error("T022", `${where} is given the helper '${helperSrcs.get(s)}': a lambda slot takes an arrow function written in place (22)`, {
              fix: `(p, …) => { … }`,
            });
          }
        }
        // Emitters: inside the bounds, forces not repeated, names well formed.
        const b = record.bounds;
        const inRange = (v) => typeof v === "number" && v >= 1 && v <= 4096;
        const boundsOk = b && inRange(b.width) && inRange(b.height);
        for (const e of record.emitter ?? []) {
          const o = e.opts;
          const en = e.emitter ?? e.name;
          if (typeof en === "string" && /^[A-Za-z_$][\w$]*$/.test(en) && !NAME_RE.test(en)) {
            ctx.error("T022", `'${en}' is not an emitter name: a name is a letter, then letters, digits or _ (22)`, {
              tip: "for example 'flame2' or 'big_jet'",
            });
          }
          if (boundsOk && (o.x < 0 || o.x > b.width || o.y < 0 || o.y > b.height)) {
            ctx.error("T014", `emitter '${en}' at (${o.x}, ${o.y}) lies outside the bounds 0..${b.width} x 0..${b.height} (14)`, {
              tip: "place the emitter inside the box, edges included",
            });
          }
          const seen = new Set();
          for (const f of o.forces ?? []) {
            if (seen.has(f)) {
              ctx.error("T016", `emitter '${en}' lists force '${f}' twice (16)`, {
                tip: "name each force at most once; forces always run in declaration order",
              });
            }
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
        data({
          x: "number",
          y: "number",
          maxRate: data("number", { min: 0 }),
          "forces?": listOf(ref("force")),
        }, { as: "opts" }),
      ],
      slots: {
        rate: {
          kind: "decl", args: [lambda("rate")], once: true, required: true,
          check: lintCheck("rate", 0, () => "the rate lambda"),
        },
        spawn: {
          kind: "decl", args: [lambda("spawn")], once: true, required: true,
          check: lintCheck("spawn", 0, () => "the spawn lambda"),
        },
      },
    },
  },
});
