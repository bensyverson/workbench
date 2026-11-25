import { defineGrammar, name, ref, data, lambda, listOf } from "kit/define";
import { particlesDialect, BUILTIN_FIELDS } from "./particles.dialect.js";

const COLLIDE = { message: "particles never see each other in this language: there is no collide", fix: ".force(\"push\", (p, dt) => { p.vel = p.vel * 0.5; })" };

const one = (v) => (Array.isArray(v) ? v[0] : v);

// The parameter names of a lambda or helper source: "(a, b) => …" or "a => …".
const paramsOf = (src) => {
  const m = /^\s*(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/.exec(src ?? "");
  if (!m) return [];
  return (m[1] ?? m[2]).split(",").map((x) => x.trim()).filter(Boolean);
};
const declaresRng = (src) => paramsOf(src).includes("rng") || /\b(?:let|const)\s+rng\b/.test(src ?? "");

const RESERVED = ["vec2", "length", "Math", "counters", "$"];

// Syntax the kit's runtime subset allows but particles does not: strings, arrays, object
// literals, `**`, and names that would shadow the language's own. Returns [message, tip] or null.
const subsetProblem = (src) => {
  const code = String(src ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const names = [...paramsOf(code), ...[...code.matchAll(/\b(?:let|const)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])];
  const bad = names.find((n) => RESERVED.includes(n));
  if (bad) return [`'${bad}' is the language's own name; no local or parameter may take it`, "pick another name"];
  const passed = /[(,]\s*(\$|counters|Math)\s*[,)]/.exec(code);
  if (passed) return [`'${passed[1]}' is passed whole; it appears only as ${passed[1]}.name`, `pass the one value instead: ${passed[1]}.name`];
  for (const k of code.matchAll(/(?<![\w$])[A-Za-z_$][\w$]*\s*\.\s*kill\s*\(\s*\)/g)) {
    const before = code.slice(0, k.index).trimEnd();
    const after = code.slice(k.index + k[0].length).trimStart();
    if (!(/(^|[;{})]|\belse)$/.test(before) && /^($|[;}])/.test(after))) {
      return ["kill() is used as a value; it is a statement on its own", "write p.kill(); as its own statement"];
    }
  }
  if (/(?<![\w$])null(?![\w$])/.test(code)) return ["particles has no null", "numbers, booleans and vec2 are its only values"];
  const bit = /(?<![|&])[|&](?![|&=])|\^|~|<<|>>|[|&^]=/.exec(code);
  if (bit) return [`particles has no bitwise operator '${bit[0]}'`, "use && || ! on booleans, and Math.floor for whole numbers"];
  if (/(?:^|[=(,?:!*/%<>\-]|\breturn)\s*\+(?![+=])/.test(code)) return ["particles has no unary '+'", "write the number itself"];
  for (const f of code.matchAll(/\bfor\s*\(\s*let\s+[\w$]+\s*=\s*([^;]*);/g)) {
    if (/\$/.test(f[1])) return [`a for loop starts at '${f[1].trim()}', but it must start at a number literal or a top-level constant`, "for (let k = 0; k < N; k++)"];
  }
  const re = /(["'])|(\*\*)|([\[{])/g;
  const head = /^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(code);
  re.lastIndex = head ? head[0].length : 0; // the parameter list is the kit's to judge
  let m;
  while ((m = re.exec(code))) {
    const before = code.slice(0, m.index).trimEnd();
    const prev = before.slice(-1);
    if (m[1]) {
      if (prev === "[") return null; // a computed access: the kit reports it
      return ["particles has no strings", "numbers, booleans and vec2 are its only values"];
    }
    if (m[2]) return ["particles has no '**' operator", "multiply it out (x * x), or use Math.sqrt for a square root"];
    const exprStart = /(^|[=(,?:\[!&|+\-*/%<>]|\breturn)$/.test(before) && !/=>$/.test(before);
    if (m[3] === "[" && exprStart) return ["particles has no arrays", "use separate locals, or a vec2 for a pair of numbers"];
    if (m[3] === "{" && exprStart) return ["particles has no object literals", "use separate locals, or a vec2 for a pair of numbers"];
  }
  return null;
};

// What every lambda slot checks from the source: the subset above, and (outside spawn)
// that the name rng is not declared, since rng means nothing there.
const lambdaCheck = (slotName, k) => (call, ctx) => {
  const src = call.args[k];
  if (typeof src !== "string") return;
  const pb = subsetProblem(src);
  if (pb) { ctx.error("X010", `the ${slotName} lambda uses code the language does not have: ${pb[0]}`, { arg: k, tip: pb[1] }); return; }
  if (slotName !== "spawn" && declaresRng(src)) {
    ctx.error("X007", `the name 'rng' means nothing in ${slotName === "update" ? "an" : "a"} ${slotName} lambda: only spawn is given rng`, { arg: k, tip: "randomness comes from spawn's rng(); draw it in spawn and keep it in a field if a later lambda needs it" });
  }
};

// The language's names: a letter, then letters, digits or _ (the kit also allows _ and $).
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const nameProblem = (kind, n) => (NAME.test(n) ? null : `'${n}' is not ${kind === "emitter" ? "an" : "a"} ${kind} name: a name is a letter, then letters, digits or _`);
const named = (kind, then) => (call, ctx) => {
  const pb = nameProblem(kind, call.args[0]);
  if (pb) { ctx.error("X015", pb, { arg: 0, tip: "for example 'heat2' or 'burned_out'" }); return; }
  if (then) then(call, ctx);
};

// Every string in a record value (lambda sources show as their text).
const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const esc = (s) => s.replace(/[$]/g, "\\$");

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
          check: named("param", (call, ctx) => {
            const o = call.args[1];
            if (!(o.min <= o.max)) ctx.error("X001", `param '${call.args[0]}' has min ${o.min} above max ${o.max}`, { arg: 1, tip: "min must be at most max" });
            else if (!(o.min <= o.value && o.value <= o.max)) ctx.error("X002", `param '${call.args[0]}' has value ${o.value} outside ${o.min}..${o.max}`, { arg: [1, "value"], tip: "value must lie within min..max, ends included" });
          }),
        },
        bounds: {
          kind: "decl", once: true, required: true,
          args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })],
        },
        maxParticles: { kind: "decl", once: true, required: true, args: [data("number", { min: 1, max: 10000, whole: true })] },
        tick: { kind: "decl", once: true, args: [data("number", { min: 0.001, max: 1 })] },
        seed: { kind: "decl", once: true, args: [data("number", { min: 0, whole: true })] },
        field: {
          kind: "decl", as: "fields",
          args: [name("field"), data({ value: "number" })],
          check: named("field", (call, ctx) => {
            if (BUILTIN_FIELDS.includes(call.args[0])) {
              ctx.error("X003", `a field may not be named '${call.args[0]}': every particle already has ${BUILTIN_FIELDS.filter((f) => f !== "kill").join(", ")}, and kill is its verb`, { arg: 0, tip: "pick another name, such as 'heat'" });
            }
          }),
        },
        counter: { kind: "decl", as: "counters", args: [name("counter")], check: named("counter") },
        force: { kind: "decl", as: "forces", args: [name("force"), lambda("force")], check: named("force", lambdaCheck("force", 1)) },
        update: { kind: "decl", once: true, args: [lambda("update")], check: lambdaCheck("update", 0) },
      },
      rejected: { collide: COLLIDE },
      check(record, ctx) {
        for (const u of record.units ?? []) {
          if (u.keyword === "let") ctx.error("X004", `top-level 'let ${u.name}' is not something a lambda may use`, { tip: "make it a const number", fix: `const ${u.name} = …` });
          else if (u.kind === "const" && !(/^-?[0-9.]+(e[-+]?[0-9]+)?$/i.test(u.src) && Number.isFinite(Number(u.src)))) {
            ctx.error("X011", `top-level constant '${u.name}' is ${u.src}, but a lambda may read only top-level number constants`, { tip: "make it a finite number expression of literals and earlier constants, or write the value into the lambda" });
          }
        }
        // Helpers are pure. The kit types a helper by its calls, so a helper no lambda reaches
        // is not checked through its untyped parameters: check those writes here, from the source.
        const helpers = (record.units ?? []).filter((u) => u.kind === "fn");
        const { units, ...rest } = record;
        const lambdaSrcs = strings(rest);
        for (const h of helpers) {
          if (lambdaSrcs.includes(h.src)) ctx.error("X012", `the helper '${h.name}' is passed as a lambda: every lambda slot takes an arrow function written in place`, { tip: "write the arrow inside the call, or call the helper from an arrow written there", fix: `(p, dt) => { ${h.name}(p, dt); }` });
        }
        const callsTo = (src, h) => new RegExp(`(?<![\\w$.])${esc(h.name)}\\s*\\(`).test(src);
        const reached = new Set();
        let frontier = strings(rest);
        while (frontier.length) {
          const next = [];
          for (const h of helpers) {
            if (!reached.has(h.name) && frontier.some((src) => callsTo(src, h))) { reached.add(h.name); next.push(h.src); }
          }
          frontier = next;
        }
        for (const h of helpers) {
          const ps = paramsOf(h.src);
          const pb = subsetProblem(h.src);
          if (pb) { ctx.error("X010", `helper '${h.name}' uses code the language does not have: ${pb[0]}`, { tip: pb[1] }); continue; }
          if (declaresRng(h.src)) {
            ctx.error("X007", `helper '${h.name}' declares the name 'rng': only spawn is given rng, and a helper never uses it`, { tip: "call rng() in spawn and pass the number to the helper" });
            continue;
          }
          if (reached.has(h.name)) continue;
          for (const q of ps) {
            const e = esc(q);
            if (new RegExp(`(?<![\\w$.])${e}\\s*\\.\\s*kill\\b`).test(h.src)) {
              ctx.error("X008", `helper '${h.name}' calls ${q}.kill(): only update may kill a particle`, { tip: "call p.kill(); in update itself" });
            } else if (new RegExp(`(?<![\\w$.])${e}(?:\\s*\\.\\s*[\\w$]+)+\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*${e}\\s*\\.`).test(h.src)) {
              ctx.error("X009", `helper '${h.name}' assigns through its parameter '${q}': a helper is pure and assigns only its own let locals`, { tip: "return the new value and assign it in the lambda that calls the helper" });
            }
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [name("emitter"), data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) }, { as: "options" })],
      slots: {
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")], check: lambdaCheck("rate", 0) },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")], check: lambdaCheck("spawn", 0) },
      },
      check(record, ctx) {
        const b = one(ctx.program?.bounds);
        const o = record.options;
        const n = record.emitter ?? record.name;
        const np = nameProblem("emitter", n);
        if (np) ctx.error("X015", np, { arg: 0, tip: "for example 'jet2'" });
        if (b && o && Number.isFinite(o.x) && Number.isFinite(o.y) && (o.x < 0 || o.x > b.width || o.y < 0 || o.y > b.height)) {
          ctx.error("X005", `emitter '${n}' at (${o.x}, ${o.y}) lies outside the bounds, x 0..${b.width} and y 0..${b.height}`, { arg: [1, o.x < 0 || o.x > b.width ? "x" : "y"], tip: "place the emitter inside the box, edges included" });
        }
        const seen = new Set();
        (o?.forces ?? []).forEach((f, k) => {
          if (seen.has(f)) ctx.error("X006", `emitter '${n}' lists force '${f}' twice`, { arg: [1, "forces", k], tip: "name each force once; forces always run in declaration order" });
          seen.add(f);
        });
      },
    },
  },
});
