import { defineGrammar, name, data, lambda, listOf, ref } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const BUILT_IN = ["pos", "vel", "age", "life", "size", "kill"];

function checkName(call, ctx) {
  const n = call.args[0];
  if (!NAME.test(n)) ctx.error("Q022", `'${n}' is not a name: a letter, then letters, digits or _`, { arg: 0, tip: "for example 'spark_2'" });
}

// ---------------------------------------------------------------------------
// The kit accepts more JavaScript than the particles language has, and does not
// look inside the untyped parameters of a helper nobody calls. These checks
// read each lambda's source and refuse the difference. A finding's code is Q0nn,
// nn being the language's refusal number.

const RESERVED = ["vec2", "length", "Math", "counters", "$"];
const PUNCT = (
  ">>>= === !== >>> <<= >>= **= &&= ||= ??= ... => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= << >> ** " +
  "{ } ( ) [ ] ; , < > + - * / % & | ^ ! ~ ? : = . @ #"
).split(" ");

class Refusal {
  constructor(n, message) { this.n = n; this.message = message; }
}
const outside = (what) => new Refusal(21, `${what} is not in the particles language`);

function tokenize(src) {
  const out = [];
  let i = 0;
  let newline = false;
  const push = (t, v) => { out.push({ t, v, newline }); newline = false; };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { newline = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      if (src.slice(i, stop).includes("\n")) newline = true;
      i = stop;
      continue;
    }
    if (c === "`") throw outside("a template literal");
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      push("str", src.slice(i, j + 1)); i = j + 1; continue;
    }
    let m = /^(?:0[xXbBoO][0-9a-fA-F_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/.exec(src.slice(i));
    if (m) {
      if (m[0].endsWith("n")) throw outside("a BigInt");
      push("num", m[0]); i += m[0].length; continue;
    }
    m = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/u.exec(src.slice(i));
    if (m) { push("id", m[0]); i += m[0].length; continue; }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) throw outside(`'${c}'`);
    push("p", p); i += p.length;
  }
  push("end", "");
  return out;
}

const BINARY = [["||"], ["&&"], ["===", "!=="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];
const ASSIGN = ["=", "+=", "-=", "*=", "/=", "%="];
const BAD_WORDS = ["while", "do", "switch", "var", "this", "new", "class", "function", "delete", "typeof",
  "instanceof", "void", "in", "await", "yield", "async", "throw", "try", "null", "super", "import", "with", "debugger"];

// Parses one arrow or function declaration into { params, body }.
function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = (k = 0) => toks[Math.min(i + k, toks.length - 1)];
  const next = () => toks[i++];
  const is = (v) => peek().t !== "num" && peek().t !== "str" && peek().v === v;
  const eat = (v) => (is(v) ? (i++, true) : false);
  const unexpected = () => {
    const v = peek().v;
    return outside(v === "" ? "this syntax" : `'${v}'`);
  };
  const expect = (v) => { if (!eat(v)) throw unexpected(); };
  const ident = () => {
    if (peek().t !== "id" || BAD_WORDS.includes(peek().v)) throw unexpected();
    return next().v;
  };
  const end = () => {
    if (eat(";")) return;
    if (is("}") || peek().t === "end" || peek().newline) return;
    throw unexpected();
  };

  function params() {
    const list = [];
    expect("(");
    while (!eat(")")) {
      if (is("...")) throw outside("a rest parameter");
      if (is("{") || is("[")) throw outside("a destructured parameter");
      list.push(ident());
      if (is("=")) throw outside("a default parameter value");
      if (!is(")")) expect(",");
    }
    return list;
  }

  function block() {
    expect("{");
    const body = [];
    while (!eat("}")) body.push(statement());
    return { t: "block", body };
  }

  function declaration() {
    const kind = next().v;
    const decls = [];
    do {
      if (is("{") || is("[")) throw outside("destructuring");
      const id = ident();
      if (!eat("=")) throw outside(`'${kind} ${id}' without an initial value`);
      decls.push({ id, init: expression() });
    } while (eat(","));
    return { t: "decl", kind, decls };
  }

  function statement() {
    if (is("{")) return block();
    if (eat(";")) return { t: "block", body: [] };
    if (is("const") || is("let")) { const d = declaration(); end(); return d; }
    if (eat("if")) {
      expect("(");
      const test = expression();
      expect(")");
      const then = statement();
      return { t: "if", test, then, other: eat("else") ? statement() : null };
    }
    if (eat("for")) {
      const shape = () => outside("a for loop other than for (let k = A; k < B; k++), A and B number literals or top-level constants,");
      expect("(");
      if (!eat("let")) throw shape();
      const k = ident();
      if (!eat("=")) throw shape();
      const from = expression();
      if (!eat(";") || ident() !== k || !(eat("<") || eat("<="))) throw shape();
      const to = expression();
      if (!eat(";") || ident() !== k) throw shape();
      if (!eat("++") && !(eat("+=") && peek().t === "num" && Number(next().v) === 1)) throw shape();
      expect(")");
      for (const bound of [from, to]) {
        const b = bound.t === "unary" && bound.op === "-" ? bound.arg : bound;
        if (b.t !== "num" && b.t !== "id") throw shape();
      }
      return { t: "for", k, from, to, body: statement() };
    }
    if (eat("return")) {
      const value = is(";") || is("}") || peek().newline ? null : expression();
      end();
      return { t: "return", value };
    }
    if (is("break") || is("continue")) { next(); end(); return { t: "jump" }; }
    const expr = expression();
    end();
    return { t: "expr", expr };
  }

  function expression() {
    if (peek().t === "id" && peek(1).v === "=>") throw outside("a nested function");
    const left = conditional();
    if (peek().t === "p" && ASSIGN.includes(peek().v)) {
      if (bare(left).t !== "id" && bare(left).t !== "member") throw unexpected();
      const op = next().v;
      return { t: "assign", op, target: left, value: expression() };
    }
    return left;
  }

  function conditional() {
    const test = binary(0);
    if (!eat("?")) return test;
    const then = expression();
    expect(":");
    return { t: "cond", test, then, other: expression() };
  }

  function binary(level) {
    if (level === BINARY.length) return unary();
    let left = binary(level + 1);
    while (peek().t === "p" && BINARY[level].includes(peek().v)) {
      const op = next().v;
      left = { t: "binary", op, left, right: binary(level + 1) };
    }
    return left;
  }

  function unary() {
    if (is("!") || is("-")) { const op = next().v; return { t: "unary", op, arg: unary() }; }
    if (is("++") || is("--")) { const op = next().v; return { t: "update", op, prefix: true, target: unary() }; }
    const e = postfix();
    if ((is("++") || is("--")) && !peek().newline) return { t: "update", op: next().v, prefix: false, target: e };
    return e;
  }

  function postfix() {
    let e = primary();
    for (;;) {
      if (eat(".")) {
        if (peek().t !== "id") throw unexpected();
        e = { t: "member", obj: e, prop: next().v };
      } else if (eat("(")) {
        const args = [];
        while (!eat(")")) {
          args.push(expression());
          if (!is(")")) expect(",");
        }
        e = { t: "call", callee: e, args };
      } else if (is("[")) {
        if (e.t === "id" && e.name === "counters") throw new Refusal(25, "counters is used only as counters.name");
        throw outside("computed access, name[…],");
      } else return e;
    }
  }

  function primary() {
    const tok = peek();
    if (tok.t === "num") { next(); return { t: "num" }; }
    if (tok.t === "id") {
      if (BAD_WORDS.includes(tok.v)) throw outside(`'${tok.v}'`);
      next();
      if (tok.v === "true" || tok.v === "false") return { t: "bool" };
      return { t: "id", name: tok.v };
    }
    if (is("(")) {
      let depth = 0;
      let j = i;
      do {
        if (toks[j].v === "(") depth++;
        else if (toks[j].v === ")") depth--;
        j++;
      } while (depth > 0 && j < toks.length);
      if (toks[j]?.v === "=>") throw outside("a nested function");
      next();
      const e = expression();
      expect(")");
      return { t: "paren", expr: e };
    }
    if (tok.t === "str") throw outside("a string");
    if (is("[")) throw outside("an array");
    if (is("{")) throw outside("an object literal");
    if (is("/")) throw outside("a regular expression");
    throw unexpected();
  }

  let names;
  if (peek().v === "function") {
    next();
    ident();
    names = params();
  } else if (peek().t === "id") {
    names = [ident()];
    expect("=>");
  } else {
    names = params();
    expect("=>");
  }
  const body = is("{") ? block() : expression();
  eat(";");
  if (peek().t !== "end") throw unexpected();
  return { params: names, body };
}

const bare = (e) => (e && e.t === "paren" ? bare(e.expr) : e);
const dotted = (e) => {
  const x = bare(e);
  if (x.t === "id") return x.name;
  if (x.t === "member") return `${dotted(x.obj)}.${x.prop}`;
  return "…";
};

// Reads one lambda ("rate", "spawn", "force", "update" or "helper") and returns
// { findings, free }: the refusals it earns, and the names it reads from outside.
function inspect(src, kind) {
  const findings = [];
  const free = [];
  const helperParts = [];
  const add = (n, message) => findings.push(new Refusal(n, message));
  let fn;
  try {
    fn = parse(src);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    return { findings: [e], free };
  }

  const declare = (id) => {
    if (RESERVED.includes(id)) add(21, `no local or parameter may be named '${id}'`);
    if (id === "rng" && kind !== "spawn") add(7, "the name rng means nothing outside spawn");
  };
  fn.params.forEach(declare);
  const particle = kind === "helper" || kind === "rate" ? null : fn.params[0];
  const rng = kind === "spawn" ? fn.params[1] : undefined;

  const lookup = (scope, name) => {
    for (let s = scope; s; s = s.up) if (s.names.has(name)) return s.names.get(name);
    return undefined;
  };
  const top = { names: new Map(fn.params.map((p) => [p, { kind: "param" }])), up: null };

  function target(node, scope) {
    const t = bare(node);
    let root = t;
    while (root.t === "member" || root.t === "paren") root = root.t === "member" ? root.obj : root.expr;
    if (root.t !== "id") return;
    const local = lookup(scope, root.name);
    if (local?.loop) add(21, `a for loop's body never assigns its counter '${root.name}'`);
    if (kind === "helper") {
      if (root.name !== "counters" && local?.kind !== "let") {
        add(8, `a helper is pure: it assigns only its own let locals, not '${dotted(t)}'`);
      }
      return;
    }
    if (t.t === "member" && bare(t.obj).t === "member" && bare(bare(t.obj).obj).name === particle &&
        root.name === particle && bare(t.obj).prop === "age") {
      add(4, "only the host writes age");
    }
    // A write to part of a particle's vector field: p.vel.x = …
    const field = t.t === "member" ? bare(t.obj) : null;
    if (kind !== "rate" && field?.t === "member" && bare(field.obj).t === "id" && bare(field.obj).name === particle &&
        root.name === particle && (field.prop === "pos" || field.prop === "vel") && (t.prop === "x" || t.prop === "y")) {
      if (kind === "force" && field.prop !== "vel") add(3, `a force writes only vel, not ${field.prop}`);
      else {
        const whole = `${particle}.${field.prop}`;
        const parts = t.prop === "x" ? `vec2(…, ${whole}.y)` : `vec2(${whole}.x, …)`;
        add(5, `'${dotted(t)}' writes part of a vector field; write the whole field, ${whole} = ${parts}`);
      }
    }
  }

  function walk(node, scope, use = "value") {
    if (!node) return;
    switch (node.t) {
      case "num":
      case "bool":
      case "jump":
        return;
      case "paren":
        return walk(node.expr, scope, use);
      case "id": {
        const n = node.name;
        if (n === "rng" && kind !== "spawn") add(7, "the name rng means nothing outside spawn");
        if (n === rng && lookup(scope, n)?.kind === "param") add(7, `'${n}' is only called, ${n}(), never passed or stored`);
        const local = lookup(scope, n);
        if (!local) free.push({ name: n, use });
        if (use !== "object") {
          if (n === "counters") add(25, "counters is used only as counters.name");
          if (n === "$") add(21, "$ is used only as $.name");
          if (n === "Math") add(21, "Math is used only as Math.name");
        }
        return;
      }
      case "member": {
        if (node.prop === "kill") {
          const o = bare(node.obj);
          const named = o.t === "id" && ["$", "counters", "Math"].includes(o.name);
          if (!named) add(9, "kill is only the statement p.kill();");
        }
        if (kind === "helper") helperParts.push({ node, scope });
        return walk(node.obj, scope, "object");
      }
      case "call": {
        const callee = bare(node.callee);
        if (callee.t === "member" && callee.prop === "collide") {
          add(20, "there is no collide: particles never see each other in this language");
        } else if (callee.t === "member" && callee.prop === "kill") {
          if (kind !== "update") add(6, "p.kill() may be called only in update");
          else if (use !== "statement" || node.args.length > 0) {
            add(9, "kill is only the statement p.kill(); with no arguments and no value");
          }
          walk(callee.obj, scope, "object");
        } else if (callee.t === "id") {
          const local = lookup(scope, callee.name);
          if (callee.name === "rng" && kind !== "spawn") add(7, "rng() may be called only in spawn");
          else if (local && callee.name !== rng) add(21, `'${callee.name}' is not a function the language has`);
          if (!local) free.push({ name: callee.name, use: "call" });
        } else {
          if (callee.t === "member" && kind === "helper" && bare(callee.obj).t === "id" &&
              lookup(scope, bare(callee.obj).name)) {
            add(9, `there is no verb '${callee.prop}'`);
          }
          walk(callee, scope);
        }
        node.args.forEach((a) => walk(a, scope));
        return;
      }
      case "assign":
        target(node.target, scope);
        // Assigning $ or Math itself is a write the kit refuses.
        if (!["$", "Math"].includes(bare(node.target).name)) walk(node.target, scope);
        return walk(node.value, scope);
      case "update": {
        const t = bare(node.target);
        if (node.prefix && t.t === "member" && bare(t.obj).t === "id" && bare(t.obj).name === "counters" && kind !== "helper") {
          add(kind === "rate" || kind === "force" ? 24 : 23,
            `a counter is only bumped, with the statement counters.${t.prop}++ or counters.${t.prop} += n`);
        }
        target(node.target, scope);
        return walk(node.target, scope);
      }
      case "unary":
        return walk(node.arg, scope);
      case "binary":
        walk(node.left, scope);
        return walk(node.right, scope);
      case "cond":
        walk(node.test, scope);
        walk(node.then, scope);
        return walk(node.other, scope);
      case "block": {
        const inner = { names: new Map(), up: scope };
        node.body.forEach((s) => walk(s, inner));
        return;
      }
      case "decl":
        for (const d of node.decls) {
          declare(d.id);
          walk(d.init, scope);
          scope.names.set(d.id, { kind: node.kind });
        }
        return;
      case "if":
        walk(node.test, scope);
        walk(node.then, { names: new Map(), up: scope });
        return walk(node.other, { names: new Map(), up: scope });
      case "for": {
        declare(node.k);
        for (const bound of [node.from, node.to]) {
          const b = bound.t === "unary" ? bound.arg : bound;
          if (b.t === "id" && lookup(scope, b.name)) add(21, `a for loop's bound is a number literal or a top-level constant, not '${b.name}'`);
          walk(bound, scope);
        }
        return walk(node.body, { names: new Map([[node.k, { kind: "let", loop: true }]]), up: scope });
      }
      case "return":
        return walk(node.value, scope);
      case "expr":
        return walk(node.expr, scope, "statement");
    }
  }

  // An expression body in spawn, force or update is the kit's to refuse (L012):
  // read it as the statement it was meant to be.
  walk(fn.body, top, fn.body.t !== "block" && ["spawn", "force", "update"].includes(kind) ? "statement" : "value");

  // A helper's members of its parameters, checked later against the fields.
  const members = [];
  for (const { node, scope } of helperParts) {
    const o = bare(node.obj);
    if (o.t === "id" && lookup(scope, o.name)?.kind === "param") members.push({ prop: node.prop, inner: null });
    if (o.t === "member" && bare(o.obj).t === "id" && lookup(scope, bare(o.obj).name)?.kind === "param" &&
        (o.prop === "pos" || o.prop === "vel")) members.push({ prop: o.prop, inner: node.prop });
  }
  return { findings, free, members };
}

const TIPS = {
  4: "keep your own number in a .field",
  3: "a force changes p.vel only; change other fields in update",
  5: "replace the whole vector, for example p.vel = vec2(0, p.vel.y)",
  6: "to remove a particle, call p.kill(); in .update(…)",
  7: "choose randomness in spawn with rng(), keep it in a .field, and read the field later",
  8: "return a value and let the lambda that calls the helper assign it",
  9: "the fields are pos, vel, age, life, size and each .field; the one verb is the statement p.kill();",
  12: "a vec2 has .x and .y",
  19: "use a top-level number constant, const NAME = 3;",
  20: "write what each particle does on its own, in .force(…) or .update(…)",
  21: "use const, let, if, return, a counted for loop, arithmetic, comparisons, && || ! and ? :",
  22: "write the arrow inside the call",
  23: "write counters.name++ or counters.name += n, as a statement",
  24: "only spawn and update bump a counter, and only a rate reads it",
  25: "name one declared counter: counters.name",
};

// The order a mistake that fits two numbers is decided in.
const ORDER = [20, 7, 25, 23, 24, 6, 9, 8, 4, 3, 5, 21];
function report(ctx, findings, where, at) {
  if (findings.length === 0) return;
  const rank = (f) => ORDER.indexOf(f.n);
  const first = [...findings].sort((a, b) => rank(a) - rank(b))[0];
  const code = `Q${String(first.n).padStart(3, "0")}`;
  ctx.error(code, `${where}${first.message}`, { ...at, tip: TIPS[first.n] });
}

// A slot check for the lambda at argument `arg`.
const body = (kind, arg) => (call, ctx) => {
  const src = call.args[arg];
  if (typeof src !== "string") return;
  report(ctx, inspect(src, kind).findings, `in this ${kind} lambda: `, { arg });
};

// Helpers and the constants lambdas read, once every declaration is known.
function checkUnits(record, ctx) {
  const units = record.units ?? [];
  const fields = new Set([...BUILT_IN, "x", "y", ...Object.keys(record.field ?? {})]);
  const lambdas = [];
  for (const u of units) {
    if (u.kind !== "fn") continue;
    if (RESERVED.includes(u.name)) report(ctx, [outside(`a helper named '${u.name}'`)], "", {});
    const found = inspect(u.src, "helper");
    for (const m of found.members ?? []) {
      if (!fields.has(m.prop)) found.findings.push(new Refusal(9, `a particle has no '${m.prop}'`));
      else if (m.inner !== null && m.inner !== "x" && m.inner !== "y") {
        found.findings.push(new Refusal(12, `a vec2 has no member '${m.inner}'`));
      }
    }
    report(ctx, found.findings, `in the helper '${u.name}': `, {});
    lambdas.push({ where: `in the helper '${u.name}': `, free: found.free });
  }
  // A lambda's source, whether the record holds it bare or as its call's arguments.
  const source = (v) => (Array.isArray(v) ? v.at(-1) : v);
  const slotSources = [];
  const add = (v, kind, where) => {
    const src = source(v);
    if (typeof src !== "string") return;
    slotSources.push(src);
    lambdas.push({ where, free: inspect(src, kind).free });
  };
  for (const [n, v] of Object.entries(record.force ?? {})) add(v, "force", `in the force '${n}': `);
  add(record.update, "update", "in update: ");
  for (const e of record.emitter ?? []) {
    add(e.rate, "rate", `in the rate of '${e.emitter}': `);
    add(e.spawn, "spawn", `in the spawn of '${e.emitter}': `);
  }
  const byName = new Map(units.map((u) => [u.name, u]));
  // A helper handed to a lambda slot by name arrives as the helper's own text.
  // A helper something calls is left alone: an equal arrow may be written twice.
  const used = new Set(lambdas.flatMap((l) => l.free.map((f) => f.name)));
  for (const u of units) {
    if (u.kind === "fn" && !used.has(u.name) && slotSources.includes(u.src)) {
      report(ctx, [new Refusal(22, `a lambda slot takes an arrow written in place, not the helper '${u.name}'`)], "", {});
    }
  }
  for (const { where, free } of lambdas) {
    for (const { name: n, use } of free) {
      const u = byName.get(n);
      if (!u) continue;
      if (u.kind === "fn" && use !== "call") {
        report(ctx, [outside(`storing or passing the function '${n}' (functions are only called)`)], where, {});
      } else if (u.kind !== "fn" && (u.keyword === "let" || u.keyword === "var")) {
        report(ctx, [new Refusal(19, `'${n}' is a top-level ${u.keyword}: a lambda may use only top-level number constants`)], where, {});
      } else if (u.kind !== "fn" && !Number.isFinite(Number(u.src.trim() || NaN))) {
        report(ctx, [new Refusal(19, `'${n}' is not a number: a lambda may use only top-level number constants`)], where, {});
      }
    }
  }
}

// ---------------------------------------------------------------------------

const named = (ns, ...rest) => ({ kind: "decl", args: [name(ns), ...rest], check: checkName });

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: {
      opens: [data("string")],
      slots: {
        param: {
          ...named("param", data({ value: "number", min: "number", max: "number" })),
          as: "params",
          check(call, ctx) {
            checkName(call, ctx);
            const { value, min, max } = call.args[1];
            if (!(min <= value && value <= max)) {
              ctx.error("Q022", `param '${call.args[0]}' needs min <= value <= max`, { arg: 1, tip: "move value inside min..max, or widen the range" });
            }
          },
        },
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
        field: {
          ...named("field", data({ value: "number" })),
          check(call, ctx) {
            checkName(call, ctx);
            if (BUILT_IN.includes(call.args[0])) {
              ctx.error("Q009", `a field may not be named '${call.args[0]}': every particle already has it`, { arg: 0, tip: "give the field another name" });
            }
          },
        },
        counter: named("counter"),
        force: {
          ...named("force", lambda("force")),
          check(call, ctx) {
            checkName(call, ctx);
            body("force", 1)(call, ctx);
          },
        },
        update: { kind: "decl", once: true, args: [lambda("update")], check: body("update", 0) },
      },
      rejected: {
        collide: {
          message: "there is no collide: particles never see each other in this language",
          fix: ".force(…) or .update(…), which act on one particle at a time",
        },
      },
      check(record, ctx) {
        checkUnits(record, ctx);
        const box = record.bounds?.[0] ?? record.bounds;
        for (const e of record.emitter ?? []) {
          const o = e.options;
          if (box && !(o.x >= 0 && o.x <= box.width && o.y >= 0 && o.y <= box.height)) {
            ctx.error("Q014", `emitter '${e.emitter}' at (${o.x}, ${o.y}) is outside the bounds ${box.width} by ${box.height}`, {
              tip: "place it with 0 <= x <= width and 0 <= y <= height",
            });
          }
        }
      },
    },
    emitter: {
      parent: "particles",
      required: true,
      opens: [
        name("emitter"),
        data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) }, { as: "options" }),
      ],
      slots: {
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")], check: body("rate", 0) },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")], check: body("spawn", 0) },
      },
      check(record, ctx) {
        // A name that is no identifier at all is already the kit's B004.
        if (/^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u.test(record.emitter) && !NAME.test(record.emitter)) {
          ctx.error("Q022", `'${record.emitter}' is not a name: a letter, then letters, digits or _`, { tip: "for example 'jet_2'" });
        }
        const forces = record.options.forces ?? [];
        const twice = forces.find((f, i) => forces.indexOf(f) !== i);
        if (twice !== undefined) ctx.error("Q016", `emitter '${record.emitter}' lists the force '${twice}' twice`, { tip: "list each force once" });
      },
    },
  },
});
