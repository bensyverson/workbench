import { defineGrammar, name, data, lambda, listOf, ref } from "kit/define";
import { particlesDialect } from "./particles.dialect.js";

// Our own refusals are X0NN, where NN is the number of the refusal on the language sheet.
// The kit refuses most mistakes itself; what follows covers only what it lets through.

// ── A small reader for lambda source. Anything it cannot read is left to the kit. ──

const TOKEN = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|((?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d+)(?:[eE][+-]?\d+)?))|([A-Za-z_$\u0080-￿][\w$\u0080-￿]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(>>>=|\.\.\.|===|!==|\*\*=|<<=|>>=|>>>|&&=|\|\|=|\?\?=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\*\*|<<|>>|[-+*/%<>=!&|^~?:;,.(){}[\]])/y;

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const m = TOKEN.exec(src);
    if (!m) throw new Error("unreadable");
    if (m[1] !== undefined) out.push({ k: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "id", v: m[2] });
    else if (m[3] !== undefined) out.push({ k: "str", v: m[3] });
    else if (m[4] !== undefined) out.push({ k: "p", v: m[4] });
  }
  return out;
}

const LEVELS = [["??"], ["||"], ["&&"], ["|"], ["^"], ["&"], ["===", "!==", "==", "!="], ["<", "<=", ">", ">="], ["<<", ">>", ">>>"], ["+", "-"], ["*", "/", "%"], ["**"]];
const ASSIGN = ["=", "+=", "-=", "*=", "/=", "%=", "**=", "&=", "|=", "^=", "<<=", ">>=", ">>>=", "&&=", "||=", "??="];
const UNREAD = ["while", "do", "switch", "var", "function", "class", "new", "this", "delete", "typeof", "void", "await", "yield", "throw", "try", "async"];

function parse(src) {
  const toks = tokenize(src);
  let at = 0;
  const peek = (n = 0) => (toks[at + n] && toks[at + n].k !== "str" ? toks[at + n].v : undefined);
  const next = () => { const t = toks[at++]; if (!t) throw new Error("end"); return t; };
  const eat = (v) => (peek() === v ? (at++, true) : false);
  const need = (v) => { if (!eat(v)) throw new Error("expected " + v); };
  const ident = () => { const t = next(); if (t.k !== "id" || UNREAD.includes(t.v)) throw new Error("name"); return t.v; };

  const list = (close, item) => {
    const out = [];
    while (!eat(close)) { out.push(item()); if (!eat(",")) { need(close); break; } }
    return out;
  };
  const primary = () => {
    const t = next();
    if (t.k === "num") return { t: "num" };
    if (t.k === "str") return { t: "other", what: "a string" };
    if (t.k === "id") {
      if (UNREAD.includes(t.v)) throw new Error("unread");
      if (t.v === "true" || t.v === "false") return { t: "bool" };
      if (t.v === "null") return { t: "other", what: "null" };
      return { t: "id", name: t.v };
    }
    if (t.v === "(") { const e = expression(); need(")"); return e; }
    if (t.v === "[") return { t: "other", what: "an array", parts: list("]", assignment) };
    if (t.v === "{") {
      const parts = list("}", () => { next(); return eat(":") ? assignment() : { t: "num" }; });
      return { t: "other", what: "an object literal", parts };
    }
    throw new Error("unexpected " + t.v);
  };
  const postfix = () => {
    let e = primary();
    for (;;) {
      if (eat(".")) e = { t: "member", object: e, name: next().v };
      else if (eat("[")) { const index = expression(); need("]"); e = { t: "index", object: e, index }; }
      else if (eat("(")) e = { t: "call", callee: e, args: list(")", assignment) };
      else if (peek() === "++" || peek() === "--") e = { t: "update", op: next().v, target: e, prefix: false };
      else return e;
    }
  };
  const unary = () => {
    if (peek() === "++" || peek() === "--") { const op = next().v; return { t: "update", op, target: unary(), prefix: true }; }
    if (["!", "-", "+", "~"].includes(peek())) { const op = next().v; return { t: "unary", op, arg: unary() }; }
    return postfix();
  };
  const binary = (level) => {
    if (level === LEVELS.length) return unary();
    let e = binary(level + 1);
    while (LEVELS[level].includes(peek())) { const op = next().v; e = { t: "binary", op, left: e, right: binary(level + 1) }; }
    return e;
  };
  const assignment = () => {
    if (peek(1) === "=>" || (peek() === "(" && arrowAhead())) throw new Error("nested function");
    let e = binary(0);
    if (eat("?")) { const yes = assignment(); need(":"); return { t: "cond", test: e, yes, no: assignment() }; }
    if (ASSIGN.includes(peek())) { const op = next().v; return { t: "assign", op, target: e, value: assignment() }; }
    return e;
  };
  const arrowAhead = () => {
    let depth = 0;
    for (let i = at; i < toks.length; i++) {
      if (toks[i].v === "(") depth++;
      else if (toks[i].v === ")" && --depth === 0) return toks[i + 1]?.v === "=>";
    }
    return false;
  };
  const expression = () => assignment();

  const declaration = (kind) => {
    const decls = [];
    do {
      let id = null, pattern = false;
      if (peek() === "[" || peek() === "{") { primary(); pattern = true; } else id = ident();
      const init = eat("=") ? assignment() : null;
      decls.push({ name: id, pattern, init });
    } while (eat(","));
    return { t: "decl", kind, decls };
  };
  const statement = () => {
    if (eat("{")) { const body = []; while (!eat("}")) body.push(statement()); return { t: "block", body }; }
    if (eat(";")) return { t: "block", body: [] };
    if (peek() === "const" || peek() === "let") { const s = declaration(next().v); eat(";"); return s; }
    if (eat("if")) {
      need("("); const test = expression(); need(")");
      const yes = statement();
      return { t: "if", test, yes, no: eat("else") ? statement() : null };
    }
    if (eat("for")) {
      need("(");
      const init = peek() === "const" || peek() === "let" ? declaration(next().v) : peek() === ";" ? null : { t: "expr", expr: expression() };
      if (eat("of") || eat("in")) { const over = expression(); need(")"); return { t: "forof", init, over, body: statement() }; }
      need(";"); const test = peek() === ";" ? null : expression();
      need(";"); const step = peek() === ")" ? null : expression();
      need(")");
      return { t: "for", init, test, step, body: statement() };
    }
    if (eat("return")) {
      const value = peek() === ";" || peek() === "}" || peek() === undefined ? null : expression();
      eat(";"); return { t: "return", value };
    }
    if (eat("break") || eat("continue")) { eat(";"); return { t: "block", body: [] }; }
    const expr = expression();
    eat(";");
    return { t: "expr", expr };
  };

  const params = eat("(") ? list(")", ident) : [ident()];
  need("=>");
  const block = peek() === "{";
  const body = block ? statement() : expression();
  if (at !== toks.length) throw new Error("trailing");
  return { params, block, body };
}

const read = (src) => { try { return parse(src); } catch { return null; } };

// ── What one lambda or helper may not say ──

// Which refusal wins when one mistake fits two.
const ORDER = [20, 7, 25, 23, 24, 6, 9, 8, 4, 3, 5, 2, 19, 21, 12];
const RESERVED = ["vec2", "length", "Math", "counters", "$"];
const BUILTIN = ["pos", "vel", "age", "life", "size", "kill"];

// slot: "rate" | "spawn" | "force" | "update" | "helper". `known` is given for helpers only.
function scan(fn, slot, known) {
  const found = [];
  const bad = (n, message, tip) => found.push({ n, message, tip });
  const particle = ["spawn", "force", "update"].includes(slot) ? fn.params[0] : undefined;
  const scopes = [new Map(fn.params.map((p) => [p, "param"]))];
  const kindOf = (n) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(n)) return scopes[i].get(n); };

  const declare = (n) => {
    if (RESERVED.includes(n)) bad(21, `no local or parameter may be named '${n}'`, "pick another name");
    if (n === "rng" && slot !== "spawn") bad(7, "the name 'rng' means nothing outside spawn", "draw rng() in spawn and keep the number in a field");
  };
  fn.params.forEach(declare);

  const path = (e) => {
    const names = [];
    while (e.t === "member" || e.t === "index") { names.unshift(e.t === "member" ? e.name : null); e = e.object; }
    return { root: e.t === "id" ? e.name : undefined, names };
  };

  const write = (target) => {
    const { root, names } = path(target);
    if (target.t === "id" && kindOf(root) === "let") return;
    if (slot === "helper") {
      if (kindOf(root) === "let" && names.length === 1 && (names[0] === "x" || names[0] === "y")) return;
      if (root === "counters") return bad(known.counters.includes(names[0]) ? 24 : 25, "a helper may not touch a counter", "bump it in spawn or update");
      if (names.length > 0 && kindOf(root) === "param" && !known.fields.includes(names[0]) && names[0] !== "x" && names[0] !== "y") {
        return bad(9, `a particle has no field '${names[0]}'`, `fields: ${known.fields.join(", ")}`);
      }
      return bad(8, "a helper is pure: it assigns nothing but its own let locals", "return the value and assign it in the lambda that calls the helper");
    }
    if (target.t === "id" && root === "counters") return bad(25, "counters is used only as counters.name");
    if (root !== undefined && root === particle && names[0] === "age" && names.length > 1) return bad(4, "only the host writes age");
    if (root !== undefined && root === particle && names.length === 2 && (names[0] === "pos" || names[0] === "vel") && (names[1] === "x" || names[1] === "y")) {
      if (slot === "force" && names[0] === "pos") return bad(3, "a force writes only vel", "move particles by changing p.vel");
      const [f, c] = names;
      const whole = c === "x" ? `vec2(0, ${particle}.${f}.y)` : `vec2(${particle}.${f}.x, 0)`;
      bad(5, `a write to part of the vector field '${f}': a field is replaced whole`, `write ${particle}.${f} = ${whole}`);
    }
  };

  const expr = (e, statement = false) => {
    if (!e) return;
    switch (e.t) {
      case "id":
        if (e.name === "rng" && slot !== "spawn") bad(7, "the name 'rng' means nothing outside spawn", "draw rng() in spawn and keep the number in a field");
        if (e.name === "counters") bad(25, "counters is used only as counters.name");
        else if (e.name === "$" || e.name === "Math") bad(21, `${e.name} is used only as ${e.name}.name; it is never stored or passed`);
        return;
      case "other":
        bad(21, `${e.what} is not in this language`, "values are numbers, booleans and vec2");
        for (const p of e.parts ?? []) expr(p);
        return;
      case "member":
        if (slot === "helper" && !known.called && kindOf(path(e).root) === "param" && e.object.t === "id" && !known.fields.includes(e.name) && !["x", "y", "kill", "collide"].includes(e.name)) {
          bad(9, `a particle has no field '${e.name}'`, `fields: ${known.fields.join(", ")}`);
        }
        if (e.object.t !== "id") expr(e.object);
        else if (e.object.name === "rng") expr(e.object);
        return;
      case "index":
        bad(21, "computed access (a[b]) is not in this language", "name the member: p.vel, v.x, $.name");
        if (e.object.t !== "id") expr(e.object);
        expr(e.index);
        return;
      case "call":
        if (e.callee.t === "member" && e.callee.name === "collide") bad(20, "particles never see each other in this language, so there is no collide", "remove the call");
        else if (e.callee.t === "member" && e.callee.name === "kill") {
          if (slot !== "update") bad(6, "p.kill() belongs only in update", "kill the particle from .update(…)");
          else if (!statement || e.args.length > 0) bad(9, "kill is only the statement p.kill();, with no arguments and no value", "write p.kill();");
        } else if (e.callee.t !== "id") expr(e.callee);
        else if (e.callee.name === "rng") expr(e.callee);
        e.args.forEach((a) => expr(a));
        return;
      case "update":
      case "assign": {
        if (!statement && path(e.target).root === "counters") bad(23, "a counter bump is a statement of its own; it has no value to use", "write counters.name++; on its own line");
        if (e.op === "**=") bad(21, "'**=' is not in this language");
        if (["&=", "|=", "^=", "<<=", ">>=", ">>>="].includes(e.op)) bad(21, `'${e.op}' is not in this language`);
        write(e.target);
        if (e.target.t === "member" && e.target.object.t !== "id") expr(e.target.object);
        if (e.target.t === "index") expr(e.target);
        if (e.target.t === "id" && e.target.name === "rng") expr(e.target);
        expr(e.value);
        return;
      }
      case "unary":
        if (e.op === "+" || e.op === "~") bad(21, `unary '${e.op}' is not in this language`);
        return expr(e.arg);
      case "binary":
        if (["**", "&", "|", "^", "<<", ">>", ">>>"].includes(e.op)) bad(21, `'${e.op}' is not in this language`, "operators: + - * / % < <= > >= === !== && || !");
        expr(e.left); return expr(e.right);
      case "cond":
        expr(e.test); expr(e.yes); return expr(e.no);
    }
  };

  // A for loop's start and end are number literals or top-level constants.
  const fixed = (e) => e && (e.t === "num" || (e.t === "unary" && e.op === "-" && e.arg.t === "num") || (e.t === "id" && kindOf(e.name) === undefined));

  const statement = (s) => {
    if (!s) return;
    switch (s.t) {
      case "block":
        scopes.push(new Map()); s.body.forEach(statement); scopes.pop(); return;
      case "decl":
        for (const d of s.decls) {
          if (d.pattern) bad(21, "destructuring is not in this language", "declare each local on its own");
          expr(d.init);
          if (d.name) { declare(d.name); scopes.at(-1).set(d.name, s.kind); }
        }
        return;
      case "if":
        expr(s.test); statement(s.yes); return statement(s.no);
      case "return":
        return expr(s.value);
      case "expr":
        return expr(s.expr, true);
      case "forof":
        bad(21, "for…of and for…in are not in this language", "for (let k = 0; k < 4; k++)");
        return statement(s.body);
      case "for": {
        const d = s.init?.t === "decl" && s.init.kind === "let" && s.init.decls.length === 1 ? s.init.decls[0] : undefined;
        const counts = (x) => x?.t === "id" && x.name === d?.name;
        const stepOk = s.step && counts(s.step.target) && ((s.step.t === "update" && s.step.op === "++" && !s.step.prefix) || (s.step.t === "assign" && s.step.op === "+="));
        const ok = d && fixed(d.init) && s.test?.t === "binary" && (s.test.op === "<" || s.test.op === "<=") && counts(s.test.left) && fixed(s.test.right) && stepOk;
        scopes.push(new Map());
        statement(s.init);
        if (!ok) bad(21, "a for loop has a fixed count: for (let k = A; k < B; k++), with A and B number literals or top-level constants");
        expr(s.test); expr(s.step, true); statement(s.body);
        scopes.pop();
      }
    }
  };

  if (fn.block) statement(fn.body); else expr(fn.body);
  return found.sort((a, b) => ORDER.indexOf(a.n) - ORDER.indexOf(b.n))[0];
}

const report = (ctx, found, where) =>
  ctx.error(`X${String(found.n).padStart(3, "0")}`, `${where}: ${found.message}`, found.tip ? { tip: found.tip } : { tip: "see what the language allows in lambdas" });

const lambdaCheck = (slot) => (call, ctx) => {
  const src = call.args.at(-1);
  if (typeof src !== "string") return;
  const fn = read(src);
  const found = fn && scan(fn, slot);
  if (found) report(ctx, found, `the ${slot} lambda`);
};

// ── Types: the kit lets a number and a boolean mix in a ternary or a helper's returns ──

const FIELD_TYPES = { pos: "vec", vel: "vec" };

function typeCheck(lambdas, helpers) {
  const argTypes = new Map(); // helper -> [Set of types per parameter]
  const returns = new Map(); // helper -> type
  let problem;
  const walk = (fn, paramTypes) => {
    let env = new Map(fn.params.map((p, i) => [p, paramTypes[i]]));
    const results = new Set();
    const expr = (e) => {
      if (!e) return undefined;
      switch (e.t) {
        case "num": return "num";
        case "bool": return "bool";
        case "id": return env.has(e.name) ? env.get(e.name) : undefined;
        case "member": {
          const o = e.object.t === "id" ? e.object.name : undefined;
          if (o === "$" || o === "counters" || o === "Math") return "num";
          const of = expr(e.object);
          if (of === "particle") return FIELD_TYPES[e.name] ?? "num";
          return of === "vec" ? "num" : undefined;
        }
        case "call": {
          const types = e.args.map(expr);
          const c = e.callee;
          if (c.t === "member") return c.object.name === "Math" ? "num" : undefined;
          if (c.t !== "id") return undefined;
          if (c.name === "vec2") return "vec";
          if (c.name === "length") return "num";
          if (env.get(c.name) === "rng") return "num";
          if (helpers.has(c.name) && !env.has(c.name)) {
            const seen = argTypes.get(c.name) ?? argTypes.set(c.name, []).get(c.name);
            types.forEach((t, i) => { if (t) (seen[i] ??= new Set()).add(t); });
            return returns.get(c.name);
          }
          return undefined;
        }
        case "unary": { const t = expr(e.arg); return e.op === "!" ? "bool" : t; }
        case "binary": {
          const l = expr(e.left), r = expr(e.right);
          if (["<", "<=", ">", ">=", "===", "!==", "&&", "||"].includes(e.op)) return "bool";
          if (l === "vec" || r === "vec") return "vec";
          return l === "num" && r === "num" ? "num" : undefined;
        }
        case "cond": {
          expr(e.test);
          const y = expr(e.yes), n = expr(e.no);
          if (y && n && y !== n) problem ??= "the two arms of a ternary have different types";
          return y ?? n;
        }
        case "assign": { const v = expr(e.value); expr(e.target); return v; }
        case "update": expr(e.target); return "num";
        default: return undefined;
      }
    };
    const statement = (s) => {
      if (!s) return;
      if (s.t === "block") { const outer = env; env = new Map(outer); s.body.forEach(statement); env = outer; }
      else if (s.t === "decl") for (const d of s.decls) { const t = expr(d.init); if (d.name) env.set(d.name, t); }
      else if (s.t === "if") { expr(s.test); statement(s.yes); statement(s.no); }
      else if (s.t === "return") { const t = expr(s.value); if (t) results.add(t); }
      else if (s.t === "expr") expr(s.expr);
      else if (s.t === "for") { statement(s.init); expr(s.test); expr(s.step); statement(s.body); }
    };
    if (fn.block) statement(fn.body); else { const t = expr(fn.body); if (t) results.add(t); }
    return results;
  };

  // Three rounds: parameter types flow from calls into helpers, return types back out.
  for (let round = 0; round < 3; round++) {
    for (const { fn, slot } of lambdas) {
      const types = { rate: ["num", "num"], spawn: ["particle", "rng", "num"], force: ["particle", "num"], update: ["particle", "num"] }[slot];
      walk(fn, types);
    }
    for (const [n, fn] of helpers) {
      const seen = argTypes.get(n) ?? [];
      const results = walk(fn, fn.params.map((_, i) => (seen[i]?.size === 1 ? [...seen[i]][0] : undefined)));
      if (results.size > 1) problem ??= `the helper '${n}' returns values of different types`;
      if (results.has("particle")) problem ??= `the helper '${n}' returns a particle; a helper returns a number, boolean or vector`;
      if (results.size === 1) returns.set(n, [...results][0]);
    }
  }
  return problem;
}

// ── Checks across the whole Program ──

function checkProgram(record, ctx) {
  const fail = (n, message, tip) => ctx.error(`X${String(n).padStart(3, "0")}`, message, { tip });
  const emitters = record.emitter ?? [];
  const { bounds } = record;
  for (const e of emitters) {
    const { x, y, forces: listed } = e.options ?? {};
    const forces = Array.isArray(listed) ? listed : [];
    if (bounds && (x < 0 || y < 0 || x > bounds.width || y > bounds.height)) {
      fail(14, `emitter '${e.emitter}' at (${x}, ${y}) lies outside the bounds ${bounds.width} x ${bounds.height}`, "place it inside the box, edges included");
    }
    const twice = forces.find((f, i) => forces.indexOf(f) !== i);
    if (twice !== undefined) fail(16, `emitter '${e.emitter}' lists the force '${twice}' twice`, "list each force once");
  }

  const units = record.units ?? [];
  for (const u of units) {
    if (u.keyword === "let" || u.keyword === "var") fail(19, `a lambda reads the top-level ${u.keyword} '${u.name}': only top-level number constants are visible`, `declare it with const ${u.name} = …`);
    else if (u.kind === "const" && !/^\(?\s*-?\s*(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*\)?$/.test(u.src)) {
      fail(19, `a lambda reads the top-level constant '${u.name}', which is not a number`, "only number constants are visible to lambdas");
    }
  }

  const lambdas = [];
  const add = (slot, src) => { if (typeof src === "string") lambdas.push({ slot, src }); };
  for (const src of Object.values(record.forces ?? {})) add("force", src);
  add("update", record.update);
  for (const e of emitters) { add("rate", e.rate); add("spawn", e.spawn); }

  const fnUnits = units.filter((u) => u.kind === "fn");
  const called = (n) => {
    const call = new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}\\s*\\(`);
    return [...lambdas, ...fnUnits.filter((u) => u.name !== n)].some((l) => call.test(l.src));
  };
  // A slot is given an arrow written in place: its text is not a top-level helper that nothing calls.
  for (const l of lambdas) {
    const same = fnUnits.find((u) => u.src === l.src && !called(u.name));
    if (same) fail(22, `a ${l.slot} slot is given the top-level function '${same.name}'`, "write the arrow function in place, inside the call");
  }

  const known = {
    fields: ["pos", "vel", "age", "life", "size", ...Object.keys(record.fields ?? {})],
    counters: Object.keys(record.counters ?? {}),
  };
  const helpers = new Map();
  for (const u of fnUnits) {
    if (u.name === "rng") fail(7, "no helper may be named 'rng'", "pick another name");
    if (RESERVED.includes(u.name)) fail(21, `no helper may be named '${u.name}'`, "pick another name");
    const fn = read(u.src);
    if (!fn) continue;
    helpers.set(u.name, fn);
    const found = scan(fn, "helper", { ...known, called: called(u.name) });
    if (found) report(ctx, found, `the helper '${u.name}'`);
  }

  const parsed = lambdas.map((l) => ({ slot: l.slot, fn: read(l.src) })).filter((l) => l.fn);
  const problem = typeCheck(parsed, helpers);
  if (problem) fail(12, problem, "give every arm and every path one type");
}

// ── The grammar ──

const collide = { message: "particles never see each other in this language, so there is no collide", fix: "remove .collide(…)" };

// The kit takes any JavaScript identifier as a name; the sheet wants a letter first and no '$'.
const loose = (n) => typeof n === "string" && /^[A-Za-z_$][\w$]*$/.test(n) && !/^[A-Za-z][A-Za-z0-9_]*$/.test(n);

const named = (call, ctx) => {
  const n = call.args[0];
  if (loose(n)) {
    ctx.error("X022", `'${n}' is not a name: a letter, then letters, digits or _`, { arg: 0, tip: "start the name with a letter" });
  }
};

export const particles = defineGrammar(particlesDialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [data("string", { as: "name" })],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            named(call, ctx);
            const { value, min, max } = call.args[1] ?? {};
            if ([value, min, max].every(Number.isFinite) && !(min <= value && value <= max)) ctx.error("X022", `param '${call.args[0]}': value ${value} is outside min..max (${min}..${max})`, { arg: 1, tip: "keep min <= value <= max" });
          },
        },
        field: {
          kind: "decl",
          args: [name("field"), data({ value: "number" })],
          as: "fields",
          check(call, ctx) {
            named(call, ctx);
            if (BUILTIN.includes(call.args[0])) ctx.error("X009", `a field may not be named '${call.args[0]}': every particle already has it`, { arg: 0, tip: "pick another name" });
          },
        },
        counter: { kind: "decl", args: [name("counter")], as: "counters", check: named },
        force: {
          kind: "decl",
          args: [name("force"), lambda("force")],
          as: "forces",
          check(call, ctx) { named(call, ctx); lambdaCheck("force")(call, ctx); },
        },
        bounds: { kind: "decl", once: true, required: true, args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })] },
        maxParticles: { kind: "decl", once: true, required: true, args: [data("number", { min: 1, max: 10000, whole: true })] },
        tick: { kind: "decl", once: true, args: [data("number", { min: 0.001, max: 1 })] },
        seed: { kind: "decl", once: true, args: [data("number", { min: 0, whole: true })] },
        update: { kind: "decl", once: true, args: [lambda("update")], check: lambdaCheck("update") },
      },
      rejected: { collide },
      check: checkProgram,
    },
    emitter: {
      parent: "program",
      required: true,
      opens: [name("emitter"), data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) }, { as: "options" })],
      slots: {
        rate: { kind: "decl", once: true, required: true, args: [lambda("rate")], check: lambdaCheck("rate") },
        spawn: { kind: "decl", once: true, required: true, args: [lambda("spawn")], check: lambdaCheck("spawn") },
      },
      // Emitter names follow the same rule as every other name.
      check(record, ctx) {
        if (loose(record.emitter)) ctx.error("X022", `'${record.emitter}' is not a name: a letter, then letters, digits or _`, { tip: "start the name with a letter" });
      },
    },
  },
});
