// The language's own source check. It reads the text of a lambda or helper, parses
// the JavaScript it is written in, and applies the rules of the particles sheet
// that the kit cannot be told about (or reports differently).

// ---------------------------------------------------------------- tokens

const PUNCT = (
  ">>>= === !== >>> <<= >>= **= &&= ||= ??= ... => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= << >> ** " +
  "{ } ( ) [ ] ; , < > + - * / % & | ^ ! ~ ? : = ."
).split(" ");

function tokenize(src) {
  const out = [];
  let i = 0;
  let nl = false;
  const push = (type, value, start) => {
    out.push({ type, value, start, end: i, nl });
    nl = false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { nl = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (src.startsWith("/*", i)) {
      const e = src.indexOf("*/", i + 2);
      const stop = e < 0 ? src.length : e + 2;
      if (src.slice(i, stop).includes("\n")) nl = true;
      i = stop;
      continue;
    }
    const start = i;
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i++;
      push("str", src.slice(start, i), start);
      continue;
    }
    const num = /^(0[xXbBoO][\da-fA-F_]+|(\d[\d_]*(\.[\d_]*)?|\.\d[\d_]*)([eE][+-]?\d+)?)n?/.exec(src.slice(i));
    if (num) { i += num[0].length; push("num", num[0], start); continue; }
    const id = /^[$_\p{ID_Start}][$\p{ID_Continue}]*/u.exec(src.slice(i));
    if (id) { i += id[0].length; push("id", id[0], start); continue; }
    const p = PUNCT.find((q) => src.startsWith(q, i)) ?? c;
    i += p.length;
    push("p", p, start);
  }
  push("eof", "", i);
  return out;
}

// ---------------------------------------------------------------- parser

const BINARY = [
  ["??"], ["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!=", "===", "!=="],
  ["<", ">", "<=", ">=", "in", "instanceof"], ["<<", ">>", ">>>"], ["+", "-"], ["*", "/", "%"], ["**"],
];
const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="]);

function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = (n = 0) => toks[Math.min(k + n, toks.length - 1)];
  const next = () => toks[Math.min(k++, toks.length - 1)];
  const is = (v, n = 0) => (peek(n).type === "p" || peek(n).type === "id") && peek(n).value === v;
  const eat = (v) => (is(v) ? (next(), true) : false);
  const need = (v) => { if (!eat(v)) throw new Error(`expected ${v}`); };
  const node = (type, start, rest) => ({ type, start, end: toks[Math.max(0, k - 1)].end, ...rest });

  function skipGroup() {
    let depth = 0;
    do {
      const t = next();
      if (t.type === "p" && "([{".includes(t.value)) depth++;
      else if (t.type === "p" && ")]}".includes(t.value)) depth--;
      else if (t.type === "eof") throw new Error("unbalanced");
    } while (depth > 0);
  }
  function arrowAhead() {
    if (peek().type === "id" && is("=>", 1)) return true;
    if (!is("(")) return false;
    const save = k;
    skipGroup();
    const yes = is("=>");
    k = save;
    return yes;
  }
  function params() {
    const list = [];
    need("(");
    while (!is(")")) {
      const start = peek().start;
      let plain = peek().type === "id";
      let name = plain ? next().value : null;
      if (!plain || (!is(",") && !is(")"))) {
        // a default, rest or destructured parameter: record it and skip to the next
        plain = false;
        while (!is(",") && !is(")")) {
          if (is("(") || is("[") || is("{")) skipGroup();
          else {
            const t = next();
            if (t.type === "id") name ??= t.value;
            if (t.type === "eof") throw new Error("unbalanced");
          }
        }
      }
      list.push({ name, plain, start, end: toks[k - 1].end });
      if (!eat(",")) break;
    }
    need(")");
    return list;
  }
  function arrow() {
    const start = peek().start;
    let ps;
    if (peek().type === "id") {
      const t = next();
      ps = [{ name: t.value, plain: true, start: t.start, end: t.end }];
    } else ps = params();
    need("=>");
    const block = is("{");
    const body = block ? statement() : assignment();
    return node("arrow", start, { params: ps, block, body });
  }

  function expression() {
    const start = peek().start;
    let e = assignment();
    while (eat(",")) e = node("seq", start, { left: e, right: assignment() });
    return e;
  }
  function assignment() {
    if (is("async") && !is("=>", 1) && peek(1).type !== "p") next();
    if (arrowAhead()) return arrow();
    const start = peek().start;
    const left = ternary();
    if (peek().type === "p" && ASSIGN.has(peek().value)) {
      const op = next().value;
      const value = assignment();
      return node("assign", start, { op, target: left, value });
    }
    return left;
  }
  function ternary() {
    const start = peek().start;
    const test = binary(0);
    if (!eat("?")) return test;
    const a = assignment();
    need(":");
    const b = assignment();
    return node("cond", start, { test, a, b });
  }
  function binary(level) {
    if (level === BINARY.length) return unary();
    const start = peek().start;
    let left = binary(level + 1);
    while ((peek().type === "p" || peek().type === "id") && BINARY[level].includes(peek().value)) {
      const op = next().value;
      left = node("binary", start, { op, left, right: binary(level + 1) });
    }
    return left;
  }
  function unary() {
    const start = peek().start;
    for (const op of ["!", "-", "+", "~", "typeof", "void", "delete", "await"]) {
      if (is(op)) { next(); return node("unary", start, { op, arg: unary() }); }
    }
    if (is("++") || is("--")) {
      const op = next().value;
      return node("update", start, { op, prefix: true, arg: unary() });
    }
    const e = postfix();
    if ((is("++") || is("--")) && !peek().nl) {
      const op = next().value;
      return node("update", start, { op, prefix: false, arg: e });
    }
    return e;
  }
  function args() {
    const list = [];
    need("(");
    while (!is(")")) {
      eat("...");
      list.push(assignment());
      if (!eat(",")) break;
    }
    need(")");
    return list;
  }
  function postfix() {
    const start = peek().start;
    let e = primary();
    for (;;) {
      if (is(".") || is("?.")) {
        const optional = next().value === "?.";
        if (optional && is("(")) e = node("call", start, { callee: e, args: args(), optional });
        else if (optional && eat("[")) {
          const prop = expression();
          need("]");
          e = node("index", start, { object: e, prop, optional });
        } else e = node("member", start, { object: e, prop: next().value, optional });
      } else if (eat("[")) {
        const prop = expression();
        need("]");
        e = node("index", start, { object: e, prop });
      } else if (is("(")) e = node("call", start, { callee: e, args: args() });
      else if (peek().type === "str" && peek().value[0] === "`") { next(); e = node("other", start, { what: "a tagged template", kids: [e] }); }
      else return e;
    }
  }
  function primary() {
    const start = peek().start;
    if (peek().type === "num") { const t = next(); return node("num", start, { text: t.value }); }
    if (peek().type === "str") { next(); return node("other", start, { what: "a string", kids: [] }); }
    if (eat("(")) {
      const e = expression();
      need(")");
      return e;
    }
    if (eat("[")) {
      const kids = [];
      while (!is("]")) { if (eat(",")) continue; eat("..."); kids.push(assignment()); }
      need("]");
      return node("other", start, { what: "an array", kids });
    }
    if (is("{")) { skipGroup(); return node("other", start, { what: "an object literal", kids: [] }); }
    if (peek().type === "id") {
      const word = peek().value;
      if (word === "true" || word === "false") { next(); return node("bool", start, {}); }
      if (word === "this" || word === "null" || word === "super") { next(); return node("other", start, { what: `'${word}'`, kids: [] }); }
      if (word === "new") { next(); return node("other", start, { what: "'new'", kids: [postfix()] }); }
      if (word === "function" || word === "class") {
        next();
        while (!is("{")) { if (is("(")) skipGroup(); else next(); if (peek().type === "eof") throw new Error("eof"); }
        skipGroup();
        return node("other", start, { what: `a nested ${word}`, kids: [] });
      }
      next();
      return node("id", start, { name: word });
    }
    throw new Error(`unexpected ${peek().value}`);
  }

  function declaration() {
    const start = peek().start;
    const kind = next().value;
    const decls = [];
    do {
      const dstart = peek().start;
      let name = null;
      if (peek().type === "id") name = next().value;
      else skipGroup();
      const init = eat("=") ? assignment() : null;
      decls.push(node("declarator", dstart, { name, init }));
    } while (eat(","));
    return node("decl", start, { kind, decls });
  }
  function statement() {
    const start = peek().start;
    if (eat("{")) {
      const body = [];
      while (!is("}")) {
        if (peek().type === "eof") throw new Error("eof");
        body.push(statement());
      }
      next();
      return node("block", start, { body });
    }
    if (eat(";")) return node("empty", start, {});
    if (is("const") || is("let") || is("var")) {
      const d = declaration();
      eat(";");
      return d;
    }
    if (eat("if")) {
      need("(");
      const test = expression();
      need(")");
      const then = statement();
      const otherwise = eat("else") ? statement() : null;
      return node("if", start, { test, then, otherwise });
    }
    if (eat("for")) {
      eat("await");
      need("(");
      let init = null;
      if (is("const") || is("let") || is("var")) init = declaration();
      else if (!is(";")) init = node("expr", peek().start, { expr: expression() });
      if (eat("of")) {
        const over = expression();
        need(")");
        return node("badstmt", start, { what: "a for-of loop", exprs: [over], body: statement() });
      }
      if (init?.type === "expr" && init.expr.type === "binary" && init.expr.op === "in") {
        need(")");
        return node("badstmt", start, { what: "a for-in loop", exprs: [], body: statement() });
      }
      need(";");
      const test = is(";") ? null : expression();
      need(";");
      const update = is(")") ? null : expression();
      need(")");
      return node("for", start, { init, test, update, body: statement() });
    }
    if (eat("return")) {
      const arg = is(";") || is("}") || peek().nl || peek().type === "eof" ? null : expression();
      eat(";");
      return node("return", start, { arg });
    }
    if (is("break") || is("continue")) {
      next();
      if (peek().type === "id" && !peek().nl) next();
      eat(";");
      return node("jump", start, {});
    }
    if (eat("while")) {
      need("(");
      const test = expression();
      need(")");
      return node("badstmt", start, { what: "a while loop", exprs: [test], body: statement() });
    }
    if (eat("do")) {
      const body = statement();
      need("while");
      need("(");
      const test = expression();
      need(")");
      eat(";");
      return node("badstmt", start, { what: "a do loop", exprs: [test], body });
    }
    for (const word of ["switch", "try", "throw", "function", "class", "with", "debugger"]) {
      if (is(word)) throw new Error(`'${word}' is not in the language`);
    }
    const expr = expression();
    eat(";");
    return node("expr", start, { expr });
  }

  return arrow();
}

// ---------------------------------------------------------------- checker

const RANK = [20, 7, 25, 23, 24, 6, 9, 8, 4, 1, 3, 5, 2, 11, 19, 21, 18, 12, 10];
const MATH = { min: 2, max: 2, abs: 1, sqrt: 1, floor: 1, sin: 1, cos: 1 };
const RESERVED = new Set(["vec2", "length", "Math", "counters", "$"]);
const SLOT_PARAMS = {
  rate: ["num", "num"],
  spawn: ["particle", "rng", "num"],
  force: ["particle", "num"],
  update: ["particle", "num"],
};
const has = (rec, key) => Object.prototype.hasOwnProperty.call(rec ?? {}, key);
const TYPE_NAMES = { num: "a number", bool: "a boolean", vec: "a vec2", particle: "a particle", void: "nothing" };
const say = (t) => TYPE_NAMES[t] ?? "that";

/**
 * Check one lambda. `program` is the record; `units` is the list of top-level
 * helpers and constants the lambdas read, or null where the kit does not give it.
 * Returns { problems: [{ n, message, helper }], callsHelper }.
 */
export function checkLambda(kind, source, program, units) {
  const problems = [];
  let callsHelper = false;
  const unitMap = new Map((units ?? []).map((u) => [u.name, u]));
  const memo = new Map();
  const stack = [];

  const fields = new Map([["pos", "vec"], ["vel", "vec"], ["age", "num"], ["life", "num"], ["size", "num"]]);
  for (const f of Object.keys(program.fields ?? {})) if (!fields.has(f) && f !== "kill") fields.set(f, "num");

  // A frame is the code being checked: a lambda, or one helper for one set of argument types.
  function bad(frame, n, node, message) {
    const text = frame.src.slice(node.start, node.end).replace(/\s+/g, " ");
    const line = frame.src.slice(0, node.start).split("\n").length;
    const where = frame.helper ? `in the helper '${frame.helper}'` : `in this ${kind} lambda`;
    problems.push({ n, helper: frame.helper, message: `[refusal ${n}] ${message} (${where}, its line ${line}: \`${text.slice(0, 70)}\`)` });
    return null;
  }

  const lookup = (scope, name) => {
    for (let s = scope; s; s = s.up) if (s.names.has(name)) return s.names.get(name);
    return undefined;
  };
  const free = (scope, node, name) => node?.type === "id" && node.name === name && !lookup(scope, name);
  const boundAs = (scope, node) => (node?.type === "id" ? lookup(scope, node.name) : undefined);

  function declare(frame, scope, name, node, binding) {
    if (name === null) return bad(frame, 21, node, "destructuring is not in the language");
    if (name === "rng" && kind !== "spawn") bad(frame, 7, node, "the name 'rng' means nothing outside a spawn lambda");
    else if (name === "rng" && frame.helper) bad(frame, 7, node, "a helper may not use the name 'rng'");
    if (RESERVED.has(name)) bad(frame, 21, node, `no local, parameter or helper may be named '${name}'`);
    scope.names.set(name, binding);
  }

  const rateOr = (frame) => (frame.helper ? 8 : kind === "rate" ? 1 : 2);

  // ------------------------------------------------ counters

  const isCounter = (scope, node) => (node?.type === "member" || node?.type === "index") && free(scope, node.object, "counters");

  /** Any use of counters.x that is not a legal bump statement. */
  function counterUse(frame, node, how) {
    if (node.type !== "member") return bad(frame, 25, node, "'counters' is used only as counters.name");
    if (!has(program.counters, node.prop)) return bad(frame, 25, node, `there is no counter '${node.prop}'`);
    if (frame.helper) return bad(frame, 24, node, "a helper never touches a counter");
    if (kind === "force") return bad(frame, 24, node, "a force never touches a counter");
    if (kind === "rate") {
      if (how === "read") return "num";
      return bad(frame, 24, node, "a rate lambda reads counters but never bumps or assigns one");
    }
    return bad(frame, 23, node, "spawn and update only bump a counter, with the statement counters.name += n or counters.name++; they never read or assign it, or use a bump as a value");
  }

  // ------------------------------------------------ writes

  /** The type the target of an assignment holds, or null after reporting why it cannot be written. */
  function target(frame, scope, node) {
    const chain = [];
    let base = node;
    let computed = false;
    while (base.type === "member" || base.type === "index") {
      if (base.type === "index") {
        computed = true;
        expr(frame, scope, base.prop);
        chain.unshift(null);
      } else chain.unshift(base.prop);
      base = base.object;
    }
    if (base.type !== "id") {
      expr(frame, scope, base);
      return bad(frame, rateOr(frame), node, "this cannot be assigned");
    }
    const b = lookup(scope, base.name);
    if (!b && base.name === "counters") {
      return counterUse(frame, chain.length ? { ...node, type: chain[0] === null ? "index" : "member", prop: chain[0] } : node, "write");
    }
    if (b?.type === "particle") {
      if (chain[0] === "collide") return bad(frame, 20, node, "particles never see each other: there is no collide");
      if (!chain.length) return bad(frame, rateOr(frame), node, "the particle parameter cannot be assigned");
      if (chain[0] === null) return bad(frame, 21, node, "computed access is not in the language; write p.field");
      if (chain[0] === "kill") return bad(frame, 9, node, "kill is only the statement p.kill();");
      if (!fields.has(chain[0])) return bad(frame, 9, node, `a particle has no field '${chain[0]}'`);
      if (frame.helper) return bad(frame, 8, node, "a helper is pure: it assigns only its own let locals");
      if (chain[0] === "age") return bad(frame, 4, node, "'age' is written only by the host");
      if (kind === "rate") return bad(frame, 1, node, "a rate lambda is pure");
      if (kind === "force" && chain[0] !== "vel") return bad(frame, 3, node, "a force may write only p.vel");
      if (chain.length === 1) return { type: fields.get(chain[0]), field: chain[0] };
      if (fields.get(chain[0]) === "vec" && chain.length === 2 && (chain[1] === "x" || chain[1] === "y")) {
        const other = chain[1] === "x" ? `p.${chain[0]} = vec2(0, p.${chain[0]}.y)` : `p.${chain[0]} = vec2(p.${chain[0]}.x, 0)`;
        return bad(frame, 5, node, `part of a vector field cannot be written; write the whole field, ${other}`);
      }
      return bad(frame, 12, node, "there is no such member to write");
    }
    if (b?.let && !computed) {
      if (!chain.length) return { type: b.type };
      if (b.type === "vec" && chain.length === 1 && (chain[0] === "x" || chain[0] === "y")) return { type: "num" };
      if (b.type === null) return null;
      return bad(frame, 12, node, "only the x or y of a vec2 is a member");
    }
    if (b?.let) return bad(frame, 21, node, "computed access is not in the language");
    if (b && b.type === null && b.alias) return null;
    if (!b && units && !unitMap.has(base.name) && !["$", "Math", "vec2", "length", "rng"].includes(base.name)) {
      return bad(frame, 19, node, `'${base.name}' is not a name this lambda has`);
    }
    if (base.name === "rng" && !b) return bad(frame, 7, node, "the name 'rng' means nothing here");
    return bad(frame, rateOr(frame), node, `'${base.name}' cannot be written: only p.<field> and a lambda's own let locals can`);
  }

  function assign(frame, scope, node) {
    if (!ASSIGN.has(node.op) || ["**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="].includes(node.op)) {
      bad(frame, 21, node, `'${node.op}' is not in the language`);
    }
    const to = target(frame, scope, node.target);
    let value = expr(frame, scope, node.value);
    if (value === "particle" && !to?.field) {
      return bad(frame, 2, node, "the particle is never given another name");
    }
    if (!to) return null;
    if (node.op !== "=") value = arithmetic(frame, node, node.op.slice(0, -1), to.type, value);
    if (value === null || to.type === null) return null;
    if (value !== to.type) {
      if (to.field) return bad(frame, 10, node, `the field '${to.field}' holds ${say(to.type)}, not ${say(value)}`);
      return bad(frame, 12, node, `this local holds ${say(to.type)}, not ${say(value)}`);
    }
    return value;
  }

  function increment(frame, scope, node) {
    const to = target(frame, scope, node.arg);
    if (!to || to.type === null) return null;
    if (to.type !== "num") return bad(frame, 12, node, `${node.op} counts a number, not ${say(to.type)}`);
    return "num";
  }

  // ------------------------------------------------ expressions

  function arithmetic(frame, node, op, a, b) {
    if (a === null || b === null) return null;
    if (a === "num" && b === "num") return "num";
    if ((op === "+" || op === "-") && a === "vec" && b === "vec") return "vec";
    if (op === "*" && ((a === "vec" && b === "num") || (a === "num" && b === "vec"))) return "vec";
    if (op === "/" && a === "vec" && b === "num") return "vec";
    return bad(frame, 12, node, `'${op}' does not take ${say(a)} and ${say(b)}`);
  }

  function boolean(frame, scope, node, what) {
    const t = expr(frame, scope, node);
    if (t !== null && t !== "bool") bad(frame, 12, node, `${what} must be a boolean, not ${say(t)}`);
  }

  function member(frame, scope, node) {
    const { object, prop } = node;
    if (node.optional) bad(frame, 21, node, "'?.' is not in the language");
    if (free(scope, object, "counters")) return counterUse(frame, node, "read");
    if (free(scope, object, "$")) {
      if (!has(program.params, prop)) return bad(frame, 18, node, `there is no param '${prop}'`);
      return "num";
    }
    if (free(scope, object, "Math")) {
      if (prop === "PI") return "num";
      if (has(MATH, prop)) return bad(frame, 21, node, `Math.${prop} is only called, never stored or passed`);
      return mathUnknown(frame, node, prop);
    }
    if (boundAs(scope, object)?.type === "particle") {
      if (prop === "collide") return bad(frame, 20, node, "particles never see each other: there is no collide");
      if (prop === "kill") {
        if (kind !== "update" || frame.helper) return bad(frame, 6, node, "p.kill() belongs only in update");
        return bad(frame, 9, node, "kill is a verb, used only as the statement p.kill();");
      }
      if (!fields.has(prop)) return bad(frame, 9, node, `a particle has no field '${prop}'`);
      return fields.get(prop);
    }
    const t = expr(frame, scope, object);
    if (t === null) return null;
    if (t === "vec" && (prop === "x" || prop === "y")) return "num";
    return bad(frame, 12, node, `${say(t)} has no member '${prop}'`);
  }

  function mathUnknown(frame, node, prop) {
    if (prop === "random") {
      return bad(frame, 19, node, "Math.random is not in the language: randomness comes from spawn's rng, kept in a field if needed later");
    }
    return bad(frame, 19, node, `Math.${prop} is not in the language`);
  }

  function identifier(frame, scope, node) {
    const { name } = node;
    const b = lookup(scope, name);
    if (b) {
      if (b.type === "rng") return bad(frame, 7, node, "rng is only called, never passed or stored");
      return b.type;
    }
    if (name === "rng") return bad(frame, 7, node, "the name 'rng' means nothing outside a spawn lambda");
    if (name === "counters") return bad(frame, 25, node, "'counters' is used only as counters.name");
    if (name === "$") return bad(frame, 21, node, "'$' is used only as $.name");
    if (name === "Math" || name === "vec2" || name === "length") return bad(frame, 21, node, `'${name}' is not a value`);
    if (["Infinity", "NaN", "undefined"].includes(name)) return bad(frame, 19, node, `'${name}' is not in the language`);
    if (!units) return null;
    const unit = unitMap.get(name);
    if (!unit) return bad(frame, 19, node, `'${name}' is not a name this lambda has`);
    if (unit.kind === "fn") return bad(frame, 21, node, `the helper '${name}' is only called, never stored or passed`);
    if (!Number.isFinite(Number(unit.src)) || unit.src.trim() === "") {
      return bad(frame, 19, node, `'${name}' is not a number constant, so a lambda may not use it`);
    }
    return "num";
  }

  function call(frame, scope, node, isStatement) {
    const { callee } = node;
    if (node.optional) bad(frame, 21, node, "'?.' is not in the language");
    const values = () => node.args.map((a) => expr(frame, scope, a));
    const wrong = (what) => bad(frame, 12, node, what);

    if (callee.type === "member" && boundAs(scope, callee.object)?.type === "particle") {
      values();
      const { prop } = callee;
      if (prop === "collide") return bad(frame, 20, node, "particles never see each other: there is no collide");
      if (prop === "kill") {
        if (kind !== "update" || frame.helper) return bad(frame, 6, node, "p.kill() belongs only in update");
        if (node.args.length || !isStatement) return bad(frame, 9, node, "kill is only the statement p.kill(); with no arguments and no value");
        return "void";
      }
      if (fields.has(prop)) return wrong(`the field '${prop}' is not a function`);
      return bad(frame, 9, node, `a particle has no verb '${prop}'`);
    }
    if (callee.type === "member" && free(scope, callee.object, "Math")) {
      const got = values();
      const { prop } = callee;
      if (prop === "PI") return wrong("Math.PI is a number, not a function");
      if (!has(MATH, prop)) return mathUnknown(frame, callee, prop);
      const many = prop === "min" || prop === "max";
      if (many ? got.length < 2 : got.length !== 1) return wrong(`Math.${prop} takes ${many ? "two or more numbers" : "one number"}, not ${got.length}`);
      const off = got.find((t) => t !== "num" && t !== null);
      if (off) return wrong(`Math.${prop} takes numbers, not ${say(off)}`);
      return "num";
    }
    if (callee.type !== "id") {
      const t = expr(frame, scope, callee);
      values();
      return t === null ? null : wrong("this is not a function");
    }

    const { name } = callee;
    const b = lookup(scope, name);
    if (b) {
      const got = values();
      if (b.type === "rng") return got.length ? wrong("rng() takes no arguments") : "num";
      return b.type === null ? null : wrong(`'${name}' is ${say(b.type)}, not a function`);
    }
    if (name === "rng") { values(); return bad(frame, 7, node, "rng belongs only to a spawn lambda's own body"); }
    if (name === "vec2" || name === "length") {
      const got = values();
      const want = name === "vec2" ? ["num", "num"] : ["vec"];
      if (got.length !== want.length) return wrong(`${name} takes ${want.length} argument(s), not ${got.length}`);
      if (got.some((t, i) => t !== null && t !== want[i])) return wrong(`${name} takes ${name === "vec2" ? "two numbers" : "one vec2"}`);
      return name === "vec2" ? "vec" : "num";
    }
    if (["counters", "$", "Math"].includes(name)) { identifier(frame, scope, callee); values(); return null; }

    callsHelper = true;
    const got = values();
    if (!units) return null;
    const unit = unitMap.get(name);
    if (!unit) return bad(frame, 19, node, `'${name}' is not a function this lambda has`);
    if (unit.kind !== "fn") return wrong(`'${name}' is not a function`);
    if (stack.includes(name)) return bad(frame, 8, node, `the helper '${name}' calls itself, directly or through other helpers`);
    return helper(frame, node, name, unit.src, got);
  }

  function helper(from, node, name, src, got) {
    const key = `${name}(${got.join(",")})`;
    if (memo.has(key)) return memo.get(key);
    let tree;
    const frame = { src, helper: name, returns: [] };
    try {
      tree = parse(src);
    } catch (e) {
      memo.set(key, null);
      return bad(frame, 21, { start: 0, end: src.length }, `this code is not in the language: ${e.message}`);
    }
    if (got.length !== tree.params.length) {
      bad(from, 12, node, `the helper '${name}' takes ${tree.params.length} argument(s), not ${got.length}`);
    }
    if (got.includes("void")) bad(from, 12, node, "a helper takes numbers, booleans, vectors or a particle");
    const scope = { up: null, names: new Map() };
    tree.params.forEach((p, i) => {
      if (!p.plain) bad(frame, 21, p, "defaults, rest and destructured parameters are not in the language");
      declare(frame, scope, p.name, p, { type: got[i] ?? null });
    });
    stack.push(name);
    if (tree.block) {
      if (statement(frame, scope, tree.body)) frame.returns.push({ type: "void", node: tree.body });
    } else {
      frame.returns.push({ type: effect(frame, scope, tree.body), node: tree.body });
    }
    stack.pop();
    let result;
    for (const r of frame.returns) {
      if (r.type === null) { result = null; break; }
      if (r.type === "particle") { result = bad(frame, 12, r.node, "a helper returns a number, boolean or vector, never a particle"); break; }
      if (result === undefined) result = r.type;
      else if (result !== r.type) {
        result = bad(frame, 12, r.node, `the helper's paths return different types (${say(result)} and ${say(r.type)})`);
        break;
      }
    }
    if (result === undefined) result = "void";
    memo.set(key, result);
    return result;
  }

  /** An expression whose value is thrown away: where bumps and p.kill() are legal. */
  function effect(frame, scope, node) {
    if (node.type === "assign" && node.op === "+=" && isCounter(scope, node.target) && bumpable(frame, node.target)) {
      const t = expr(frame, scope, node.value);
      if (t !== null && t !== "num") bad(frame, 12, node, `a counter is bumped by a number, not ${say(t)}`);
      return "void";
    }
    if (node.type === "update" && node.op === "++" && !node.prefix && isCounter(scope, node.arg) && bumpable(frame, node.arg)) return "void";
    if (node.type === "call") return call(frame, scope, node, true);
    return expr(frame, scope, node);
  }
  const bumpable = (frame, node) =>
    !frame.helper && (kind === "spawn" || kind === "update") && node.type === "member" && has(program.counters, node.prop);

  function expr(frame, scope, node) {
    switch (node.type) {
      case "num":
        if (node.text.endsWith("n")) return bad(frame, 21, node, "bigints are not in the language");
        return "num";
      case "bool":
        return "bool";
      case "id":
        return identifier(frame, scope, node);
      case "member":
        return member(frame, scope, node);
      case "index":
        expr(frame, scope, node.prop);
        if (free(scope, node.object, "counters")) return counterUse(frame, node, "read");
        if (!free(scope, node.object, "$") && boundAs(scope, node.object)?.type !== "particle") expr(frame, scope, node.object);
        return bad(frame, 21, node, "computed access is not in the language");
      case "call":
        return call(frame, scope, node, false);
      case "assign":
        if (isCounter(scope, node.target)) {
          expr(frame, scope, node.value);
          return counterUse(frame, node.target, "write");
        }
        return assign(frame, scope, node);
      case "update":
        if (isCounter(scope, node.arg)) return counterUse(frame, node.arg, "write");
        return increment(frame, scope, node);
      case "unary": {
        if (node.op === "!") { boolean(frame, scope, node.arg, "the operand of '!'"); return "bool"; }
        if (node.op === "delete") {
          expr(frame, scope, node.arg);
          return bad(frame, 21, node, "'delete' is not in the language");
        }
        const t = expr(frame, scope, node.arg);
        if (node.op !== "-") return bad(frame, 21, node, `unary '${node.op}' is not in the language`);
        if (t === null || t === "num" || t === "vec") return t;
        return bad(frame, 12, node, `'-' does not negate ${say(t)}`);
      }
      case "binary": {
        const { op } = node;
        if (op === "&&" || op === "||") {
          boolean(frame, scope, node.left, `an operand of '${op}'`);
          boolean(frame, scope, node.right, `an operand of '${op}'`);
          return "bool";
        }
        const a = expr(frame, scope, node.left);
        const b = expr(frame, scope, node.right);
        if (["+", "-", "*", "/", "%"].includes(op)) return arithmetic(frame, node, op, a, b);
        if (["<", "<=", ">", ">="].includes(op)) {
          if ((a !== null && a !== "num") || (b !== null && b !== "num")) return bad(frame, 12, node, `'${op}' compares numbers only`);
          return "bool";
        }
        if (op === "===" || op === "!==") {
          const odd = [a, b].some((t) => t !== null && t !== "num" && t !== "bool");
          if (odd || (a !== null && b !== null && a !== b)) return bad(frame, 12, node, `'${op}' cannot compare ${say(a)} with ${say(b)}`);
          return "bool";
        }
        return bad(frame, 21, node, `'${op}' is not in the language`);
      }
      case "cond": {
        boolean(frame, scope, node.test, "a condition");
        const a = expr(frame, scope, node.a);
        const b = expr(frame, scope, node.b);
        if (a === null || b === null) return null;
        if (a !== b || a === "particle" || a === "void") return bad(frame, 12, node, `the arms of '? :' must be one type of value, not ${say(a)} and ${say(b)}`);
        return a;
      }
      case "arrow":
        return bad(frame, 21, node, "a nested function is not in the language");
      case "seq":
        effect(frame, scope, node.left);
        expr(frame, scope, node.right);
        return bad(frame, 21, node, "the comma operator is not in the language");
      default:
        node.kids.forEach((kid) => expr(frame, scope, kid));
        return bad(frame, 21, node, `${node.what} is not in the language`);
    }
  }

  // ------------------------------------------------ statements; each returns whether it can fall through

  function declStatement(frame, scope, node) {
    if (node.kind === "var") bad(frame, 21, node, "'var' is not in the language");
    for (const d of node.decls) {
      let t = null;
      if (!d.init) bad(frame, 21, d, "every const and let needs an initializer");
      else t = expr(frame, scope, d.init);
      let alias = false;
      if (t === "particle") { bad(frame, 2, d, "the particle is never given another name"); t = null; alias = true; }
      if (t === "void") t = bad(frame, 12, d, "this gives no value");
      declare(frame, scope, d.name, d, { type: t, let: node.kind !== "const", alias });
    }
  }

  function bound(scope, node) {
    if (node.type === "num") return true;
    if (node.type === "unary" && node.op === "-") return node.arg.type === "num";
    if (node.type !== "id" || lookup(scope, node.name)) return false;
    return !units || unitMap.get(node.name)?.kind === "const";
  }

  function forStatement(frame, scope, node) {
    const inner = { up: scope, names: new Map() };
    const { init, test, update, body } = node;
    const d = init?.type === "decl" && init.kind === "let" && init.decls.length === 1 ? init.decls[0] : null;
    const k = d?.name;
    const isK = (e) => e?.type === "id" && e.name === k;
    const fixed =
      k && d.init && bound(scope, d.init) &&
      test?.type === "binary" && (test.op === "<" || test.op === "<=") && isK(test.left) && bound(scope, test.right) &&
      ((update?.type === "update" && update.op === "++" && !update.prefix && isK(update.arg)) ||
        (update?.type === "assign" && update.op === "+=" && isK(update.target) && update.value.type === "num" && Number(update.value.text) === 1));
    if (!fixed) bad(frame, 21, node, "a for loop has a fixed count: for (let k = A; k < B; k++), with A and B number literals or top-level constants");
    if (init?.type === "decl") declStatement(frame, inner, init);
    else if (init) effect(frame, inner, init.expr);
    if (test) boolean(frame, inner, test, "a loop condition");
    if (update) effect(frame, inner, update);
    if (fixed) {
      const binding = inner.names.get(k);
      if (binding) binding.counting = true;
    }
    statement(frame, inner, body);
    if (fixed && assigns(body, k)) bad(frame, 21, node, `the loop body never assigns its counter '${k}'`);
  }

  function assigns(tree, name) {
    if (!tree || typeof tree !== "object") return false;
    if (Array.isArray(tree)) return tree.some((t) => assigns(t, name));
    const to = tree.type === "assign" ? tree.target : tree.type === "update" ? tree.arg : null;
    if (to?.type === "id" && to.name === name) return true;
    return Object.values(tree).some((v) => v && typeof v === "object" && assigns(v, name));
  }

  function statement(frame, scope, node) {
    switch (node.type) {
      case "block": {
        const inner = { up: scope, names: new Map() };
        let through = true;
        for (const s of node.body) if (!statement(frame, inner, s)) through = false;
        return through;
      }
      case "empty":
      case "jump":
        return true;
      case "decl":
        declStatement(frame, scope, node);
        return true;
      case "expr":
        effect(frame, scope, node.expr);
        return true;
      case "if": {
        boolean(frame, scope, node.test, "a condition");
        const a = statement(frame, { up: scope, names: new Map() }, node.then);
        const b = node.otherwise ? statement(frame, { up: scope, names: new Map() }, node.otherwise) : true;
        return a || b;
      }
      case "for":
        forStatement(frame, scope, node);
        return true;
      case "return": {
        const t = node.arg ? expr(frame, scope, node.arg) : "void";
        if (frame.helper) frame.returns.push({ type: t, node });
        else if (kind === "rate") {
          if (t !== "num" && t !== null) bad(frame, 11, node, `a rate gives a number, not ${say(t)}`);
        } else if (node.arg) bad(frame, 11, node, `${kind === "update" ? "an" : "a"} ${kind} lambda returns no value`);
        return false;
      }
      default:
        bad(frame, 21, node, `${node.what} is not in the language`);
        node.exprs.forEach((e) => expr(frame, scope, e));
        statement(frame, { up: scope, names: new Map() }, node.body);
        return true;
    }
  }

  // ------------------------------------------------ the lambda itself

  const frame = { src: source, helper: null, returns: [] };
  let tree;
  try {
    tree = parse(source);
  } catch (e) {
    bad(frame, 21, { start: 0, end: source.length }, `this code is not in the language: ${e.message}`);
    return { problems, callsHelper };
  }
  const want = SLOT_PARAMS[kind];
  const scope = { up: null, names: new Map() };
  tree.params.forEach((p, i) => {
    if (!p.plain) bad(frame, 21, p, "defaults, rest and destructured parameters are not in the language");
    if (i >= want.length) bad(frame, 21, p, `${kind === "update" ? "an" : "a"} ${kind} lambda has at most ${want.length} parameters`);
    const type = want[i] ?? null;
    if (p.name === "rng" && kind === "spawn") scope.names.set("rng", { type });
    else declare(frame, scope, p.name, p, { type });
  });
  if (kind === "rate") {
    if (tree.block) {
      if (statement(frame, scope, tree.body)) bad(frame, 11, tree, "a rate returns a number on every path");
    } else {
      const t = expr(frame, scope, tree.body);
      if (t !== "num" && t !== null) bad(frame, 11, tree.body, `a rate gives a number, not ${say(t)}`);
    }
  } else if (tree.block) {
    statement(frame, scope, tree.body);
  } else {
    effect(frame, scope, tree.body);
    bad(frame, 11, tree, `${kind === "update" ? "an" : "a"} ${kind} lambda has a block body { … }`);
  }
  return { problems, callsHelper };
}

/** The one problem to report: the first that applies in the sheet's order. */
export function worst(problems) {
  return [...problems].sort((a, b) => RANK.indexOf(a.n) - RANK.indexOf(b.n))[0];
}
