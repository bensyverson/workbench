import { defineDialect, exact, vector } from "kit/define";

// ───────────────────────────── The source checker ─────────────────────────────
// The kit type-checks every lambda. This finds what its checks let through (or
// report twice, or report without naming the particles rule), reading the same
// source text. A slot convention that returns a string refuses the lambda (B011).
// What the kit already reports well, at the exact expression, is left to it.
// "refusal N" in a message is the number in the language's refusal list.

const RANK = [20, 7, 25, 23, 24, 6, 9, 8, 4, 1, 3, 5, 2, 21, 19, 11, 12, 10];
const RESERVED = ["vec2", "length", "Math", "counters", "$"];
const BUILTIN_FIELDS = { pos: "vec", vel: "vec", age: "num", life: "num", size: "num" };
const MATH = ["min", "max", "abs", "sqrt", "floor", "sin", "cos"];
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

class Stop {
  constructor(n, message, at) { Object.assign(this, { n, message, at }); }
}

const PUNCT = (">>>= ... === !== >>> <<= >>= **= &&= ||= ??= => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= << >> ** " +
  "{ } ( ) [ ] ; , < > + - * / % & | ^ ! ~ ? : = .").split(" ");

function tokenize(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const word = /[A-Za-z_$\u0080-￿]/;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      line += src.slice(i, stop).split("\n").length - 1;
      i = stop;
      continue;
    }
    const start = i;
    let type;
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(0[xXbBoO][0-9a-fA-F_]+|(\d[\d_]*(\.[\d_]*)?|\.\d[\d_]*)([eE][+-]?\d+)?)n?/.exec(src.slice(i));
      i += m[0].length;
      type = "num";
    } else if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i++;
      type = "str";
    } else if (word.test(c)) {
      while (i < src.length && (word.test(src[i]) || /[0-9]/.test(src[i]))) i++;
      type = "id";
    } else {
      const p = PUNCT.find((x) => src.startsWith(x, i));
      i += p ? p.length : 1;
      type = "p";
    }
    out.push({ type, text: src.slice(start, i), line, start, end: i });
  }
  out.push({ type: "eof", text: "", line, start: i, end: i });
  return out;
}

const BINARY = { "||": 1, "&&": 2, "===": 5, "!==": 5, "<": 6, "<=": 6, ">": 6, ">=": 6, "+": 8, "-": 8, "*": 9, "/": 9, "%": 9 };
const ASSIGN = ["=", "+=", "-=", "*=", "/=", "%="];
const NOT_HERE = ["==", "!=", "**", "&", "|", "^", "<<", ">>", ">>>", "??", "?.", "~", "**=", "&=", "|=", "^=", "<<=", ">>=", ">>>=", "&&=", "||=", "??=", "instanceof", "in"];
const BAD_WORDS = ["while", "do", "switch", "var", "new", "this", "function", "class", "delete", "typeof", "void", "throw", "try", "null", "super", "import"];

/** Parses an arrow's source into { params, body, expression }. */
function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = (k = 0) => toks[Math.min(i + k, toks.length - 1)];
  const next = () => toks[Math.min(i++, toks.length - 1)];
  const is = (t) => (peek().type === "p" || peek().type === "id") && peek().text === t;
  const eat = (t) => (is(t) ? (next(), true) : false);
  const fail = (message, tok = peek()) => { throw new Stop(21, message, tok); };
  const expect = (t) => { if (!eat(t)) fail(`the language has no '${peek().text}' here`); };
  const text = (from) => src.slice(from.start, toks[Math.max(i - 1, 0)].end);
  const node = (kind, from, rest) => ({ kind, line: from.line, src: text(from), ...rest });

  function params() {
    const out = [];
    if (peek().type === "id") { out.push(next()); return out; }
    expect("(");
    while (!is(")")) {
      if (is("...")) fail("a lambda or helper takes no rest parameter");
      if (is("{") || is("[")) fail("a lambda or helper takes no destructured parameter");
      if (peek().type !== "id") fail("a parameter must be a plain name");
      out.push(next());
      if (is("=")) fail("a lambda or helper takes no default parameter");
      if (!eat(",")) break;
    }
    expect(")");
    return out;
  }

  function primary() {
    const t = peek();
    if (t.type === "num") {
      if (t.text.endsWith("n")) fail("the language has no BigInt");
      next();
      return node("num", t, { value: Number(t.text.replace(/_/g, "")) });
    }
    if (t.type === "str") fail("the language has no strings");
    if (t.type === "id") {
      if (BAD_WORDS.includes(t.text)) fail(t.text === "function" ? "no nested functions" : `the language has no '${t.text}'`);
      next();
      if (is("=>")) fail("no nested functions", t);
      if (t.text === "true" || t.text === "false") return node("bool", t);
      return node("id", t, { name: t.text });
    }
    if (t.text === "(") {
      // a nested arrow: find the matching paren and look for =>
      let depth = 0;
      for (let k = i; k < toks.length; k++) {
        if (toks[k].text === "(") depth++;
        else if (toks[k].text === ")" && --depth === 0) { if (toks[k + 1]?.text === "=>") fail("no nested functions"); break; }
      }
      next();
      const e = expression();
      if (is(",")) fail("the language has no comma operator");
      expect(")");
      return e;
    }
    if (t.text === "[") fail("the language has no arrays");
    if (t.text === "{") fail("the language has no object literals");
    return fail(`the language has no '${t.text}' here`);
  }

  function postfix() {
    const from = peek();
    let e = primary();
    for (;;) {
      if (eat(".")) {
        const name = next();
        e = node("member", from, { object: e, name: name.text });
      } else if (is("[")) {
        if (e.name === "counters") throw new Stop(25, "counters is used only as counters.name", peek());
        fail(`the language has no computed access (${text(from)}[…]); write .name`);
      } else if (eat("(")) {
        const args = [];
        while (!is(")")) {
          if (is("...")) fail("the language has no spread");
          args.push(expression());
          if (!eat(",")) break;
        }
        expect(")");
        e = node("call", from, { callee: e, args });
      } else if (peek().type === "str") fail("the language has no strings or template literals");
      else return e;
    }
  }

  function unary() {
    const from = peek();
    if (is("!") || is("-")) {
      const op = next().text;
      const arg = unary();
      return node("unary", from, { op, arg });
    }
    if (is("++") || is("--")) {
      const op = next().text;
      const target = unary();
      return node("update", from, { op, target, prefix: true });
    }
    if (is("+")) fail("the language has no unary '+'");
    const e = postfix();
    if (is("++") || is("--")) {
      const op = next().text;
      return node("update", from, { op, target: e, prefix: false });
    }
    return e;
  }

  function binary(min) {
    const from = peek();
    let left = unary();
    for (;;) {
      const t = peek();
      if (NOT_HERE.includes(t.text)) fail(`the language has no '${t.text}'`);
      const prec = t.type === "p" ? BINARY[t.text] : undefined;
      if (prec === undefined || prec < min) return left;
      next();
      const right = binary(prec + 1);
      left = node("binary", from, { op: t.text, left, right });
    }
  }

  function expression() {
    const from = peek();
    const left = binary(1);
    if (peek().type === "p" && ASSIGN.includes(peek().text)) {
      const op = next().text;
      const value = expression();
      return node("assign", from, { op, target: left, value });
    }
    if (eat("?")) {
      const then = expression();
      expect(":");
      const other = expression();
      return node("ternary", from, { test: left, then, other });
    }
    return left;
  }

  function declaration() {
    const from = next();
    const decls = [];
    do {
      if (is("{") || is("[")) fail("the language has no destructuring");
      const name = next();
      if (!is("=")) fail(`'${name.text}' needs an initial value`, name);
      next();
      decls.push({ name: name.text, init: expression(), tok: name });
    } while (eat(","));
    return node("decl", from, { keyword: from.text, decls });
  }

  function statement() {
    const from = peek();
    if (is("{")) return block();
    if (eat(";")) return node("empty", from, {});
    if (is("const") || is("let")) { const d = declaration(); eat(";"); return d; }
    if (eat("if")) {
      expect("(");
      const test = expression();
      expect(")");
      const then = statement();
      const other = eat("else") ? statement() : null;
      return node("if", from, { test, then, other });
    }
    if (eat("for")) {
      expect("(");
      const shape = "a for loop is written for (let k = A; k < B; k++), A and B numbers or top-level constants";
      if (!is("let")) fail(shape);
      const init = declaration();
      if (!eat(";")) fail(shape);
      if (is(";")) fail(shape);
      const test = expression();
      expect(";");
      if (is(")")) fail(shape);
      const update = expression();
      expect(")");
      const body = statement();
      return node("for", from, { init, test, update, body, shape });
    }
    if (eat("return")) {
      const bare = is(";") || is("}") || peek().type === "eof" || peek().line !== from.line;
      const value = bare ? null : expression();
      eat(";");
      return node("return", from, { value });
    }
    if (is("break") || is("continue")) {
      next();
      if (peek().type === "id" && peek().line === from.line) fail("the language has no labels");
      eat(";");
      return node(from.text, from, {});
    }
    if (from.type === "id" && peek(1).text === ":") fail("the language has no labels");
    if (BAD_WORDS.includes(from.text) && from.text !== "this") fail(from.text === "function" ? "no nested functions" : `the language has no '${from.text}'`);
    const e = expression();
    if (is(",")) fail("the language has no comma operator");
    eat(";");
    return node("expr", from, { expr: e });
  }

  function block() {
    const from = peek();
    expect("{");
    const body = [];
    while (!is("}") && peek().type !== "eof") body.push(statement());
    expect("}");
    return node("block", from, { body });
  }

  const ps = params();
  expect("=>");
  const expressionBody = !is("{");
  const body = expressionBody ? expression() : block();
  return { params: ps, body, expression: expressionBody };
}

/** Whether control can run past the end of a statement. */
function falls(s) {
  if (s.kind === "return" || s.kind === "break" || s.kind === "continue") return false;
  if (s.kind === "block") return s.body.every(falls);
  if (s.kind === "if") return !s.other || falls(s.then) || falls(s.other);
  return true;
}

/** Checks one lambda and the helpers it reaches. Returns the findings. */
function checkLambda(kind, src, program, claimed, label) {
  const found = [];
  const units = program.units ?? [];
  const helpers = new Map(units.filter((u) => u.kind === "fn").map((u) => [u.name, u.src]));
  const constants = new Map(units.filter((u) => u.kind === "const").map((u) => [u.name, u.src]));
  const fields = program.field ?? {};
  const counters = program.counter ?? {};
  const slotParams = {
    rate: ["num", "num"], spawn: ["particle", "rng", "num"], force: ["particle", "num"], update: ["particle", "num"],
  };
  const memo = new Map();
  const trees = new Map();
  let where = label;

  const add = (n, message, at) => {
    const spot = at ? ` (line ${at.line} of ${where}${at.src ? `: ${at.src.split("\n")[0].slice(0, 60)}` : at.text ? `, at '${at.text}'` : ""})` : "";
    const entry = { n, message: `${message}${spot}`, helper: where.startsWith("helper") };
    if (!found.some((f) => f.message === entry.message)) found.push(entry);
  };

  const fieldType = (name) => (has(BUILTIN_FIELDS, name) ? BUILTIN_FIELDS[name] : has(fields, name) ? "num" : name === "kill" ? "verb" : null);

  const lookup = (env, name) => {
    for (let e = env; e; e = e.parent) if (e.names.has(name)) return e.names.get(name);
    return undefined;
  };

  function declare(ctx, env, name, type, extra, tok) {
    if (RESERVED.includes(name)) add(21, `no local or parameter may be named '${name}'`, tok);
    if (name === "rng" && ctx.kind !== "spawn") add(7, `'rng' belongs to spawn: the name means nothing in ${ctx.kind === "helper" ? "a helper" : `a ${ctx.kind} lambda`}`, tok);
    env.names.set(name, { type, ...extra });
  }

  function condition(ctx, env, n, what) {
    const t = value(ctx, env, n);
    if (t === "num" || t === "vec" || t === "particle") {
      add(12, `${what} must be a boolean, not a ${t === "num" ? "number" : t === "vec" ? "vector" : "particle"}; compare it, as in x > 0`, n);
    }
  }

  /** The type of an expression whose value is used. */
  function value(ctx, env, n) {
    const t = infer(ctx, env, n);
    if (t === "void") {
      const kill = n.kind === "call" && n.callee.name === "kill";
      add(kill ? 9 : 12, kill ? "p.kill() has no value: it is only a statement on its own" : "this call returns nothing, so it has no value to use", n);
      return "unknown";
    }
    return t;
  }

  function product(op, a, b, n) {
    if (op === "*" && a === "vec" && b === "vec") add(12, "a vector times a vector is not an operation; a vector multiplies by a number (multiply components with vec2(a.x * b.x, a.y * b.y))", n);
  }

  function arithmetic(op, a, b) {
    if (a === "unknown" || b === "unknown") return "unknown";
    if (op === "+" || op === "-") return a === b && (a === "num" || a === "vec") ? a : "unknown";
    if (op === "*") return a === "num" && b === "num" ? "num" : (a === "vec" && b === "num") || (a === "num" && b === "vec") ? "vec" : "unknown";
    if (op === "/") return b === "num" && (a === "num" || a === "vec") ? a : "unknown";
    return a === "num" && b === "num" ? "num" : "unknown";
  }

  /** A write's target: `x`, `x.y` or `p.field[.x]`. */
  function target(ctx, env, t, whole) {
    if (t.kind === "id") {
      const local = lookup(env, t.name);
      if (local?.loop) add(21, `a for loop's count is fixed: its body never assigns '${t.name}'`, whole);
      return local?.type ?? "unknown";
    }
    if (t.kind === "member" && t.object.kind === "id" && t.object.name === "counters") {
      return "counter";
    }
    if (t.kind === "member") {
      const inner = t.object;
      if (inner.kind === "member" && inner.object.kind === "id" && lookup(env, inner.object.name)?.type === "particle") {
        const p = inner.object.name;
        const f = inner.name;
        const type = fieldType(f);
        if (type === null) add(9, `a particle has no field '${f}'`, whole);
        else if (ctx.kind === "helper") add(8, "a helper is pure: it assigns nothing but its own let locals", whole);
        else if (f === "age") add(4, "only the host writes age", whole);
        else if (ctx.kind === "force" && f !== "vel") add(3, `a force writes only ${p}.vel`, whole);
        else if (type === "vec") {
          const other = t.name === "x" ? `${p}.${f} = vec2(0, ${p}.${f}.y)` : `${p}.${f} = vec2(${p}.${f}.x, 0)`;
          add(5, `a write to part of a vector field: replace the whole field, ${other}`, whole);
        }
        return "num";
      }
      return infer(ctx, env, t);
    }
    return infer(ctx, env, t);
  }

  function infer(ctx, env, n) {
    switch (n.kind) {
      case "num": return "num";
      case "bool": return "bool";
      case "id": {
        if (n.name === "rng" && ctx.kind !== "spawn") add(7, "the name 'rng' means nothing outside spawn", n);
        const local = lookup(env, n.name);
        if (local) return local.type;
        if (n.name === "$") add(21, "$ is used only as $.name", n);
        else if (n.name === "counters") add(25, "counters is used only as counters.name", n);
        else if (n.name === "Math") add(21, "Math is used only as Math.name", n);
        else if (helpers.has(n.name) || n.name === "vec2" || n.name === "length") add(21, `'${n.name}' is a function: it is only called, never stored or passed`, n);
        else if (constants.has(n.name)) {
          const text = constants.get(n.name).trim();
          if (text === "" || !Number.isFinite(Number(text))) add(19, `'${n.name}' is not a number: lambdas read only top-level number constants`, n);
          else return "num";
        }
        return "unknown";
      }
      case "member": {
        const o = n.object;
        if (n.name === "collide") add(20, "particles never see each other in this language: there is no collide", n);
        if (o.kind === "id" && !lookup(env, o.name)) {
          if (o.name === "$") return "num";
          if (o.name === "counters") return "num";
          if (o.name === "Math") {
            if (n.name === "random") add(19, "there is no Math.random: randomness comes from spawn's rng, kept in a field if needed later", n);
            if (MATH.includes(n.name)) add(21, `Math.${n.name} is a function: it is only called, never stored or passed`, n);
            return n.name === "PI" ? "num" : "unknown";
          }
        }
        const base = value(ctx, env, o);
        if (base === "particle") {
          const type = fieldType(n.name);
          return type === "verb" ? "unknown" : type ?? "unknown";
        }
        if (base === "vec") return n.name === "x" || n.name === "y" ? "num" : "unknown";
        return "unknown";
      }
      case "call": {
        const c = n.callee;
        if (c.kind === "member") {
          if (c.name === "collide") { add(20, "particles never see each other in this language: there is no collide", n); return "unknown"; }
          const o = c.object;
          if (o.kind === "id" && o.name === "Math" && !lookup(env, "Math")) {
            if (c.name === "random") add(19, "there is no Math.random: randomness comes from spawn's rng, kept in a field if needed later", n);
            n.args.forEach((a) => value(ctx, env, a));
            return "num";
          }
          const base = value(ctx, env, o);
          n.args.forEach((a) => value(ctx, env, a));
          if (c.name === "kill" && base === "particle") {
            if (ctx.kind !== "update" && (n.args.length > 0 || ctx.expression)) add(6, "p.kill() is only for update", n);
            return "void";
          }
          return "unknown";
        }
        const args = n.args.map((a) => (a.kind === "id" && lookup(env, a.name) ? lookup(env, a.name).type : value(ctx, env, a)));
        if (c.kind !== "id") { value(ctx, env, c); return "unknown"; }
        if (c.name === "rng" && ctx.kind !== "spawn") add(7, "rng() is only for spawn's own body", n);
        const local = lookup(env, c.name);
        if (local) return local.type === "rng" ? "num" : "unknown";
        if (c.name === "vec2") return "vec";
        if (c.name === "length") return "num";
        if (helpers.has(c.name)) return helper(c.name, args);
        return "unknown";
      }
      case "unary": {
        if (n.op === "!") { condition(ctx, env, n.arg, "the operand of !"); return "bool"; }
        return value(ctx, env, n.arg);
      }
      case "update": {
        const t = n.target;
        const type = target(ctx, env, t, n);
        if (type === "counter") {
          if (n.prefix) add(23, `a counter is bumped only by the statement counters.${t.name}++ or counters.${t.name} += n`, n);
          return "num";
        }
        return type;
      }
      case "assign": {
        const type = target(ctx, env, n.target, n);
        const given = value(ctx, env, n.value);
        if (n.op !== "=" && type !== "counter") product(n.op[0], type, given, n);
        return given;
      }
      case "binary": {
        if (n.op === "&&" || n.op === "||") {
          condition(ctx, env, n.left, `an operand of ${n.op}`);
          condition(ctx, env, n.right, `an operand of ${n.op}`);
          return "bool";
        }
        const a = value(ctx, env, n.left);
        const b = value(ctx, env, n.right);
        if (["===", "!==", "<", "<=", ">", ">="].includes(n.op)) return "bool";
        product(n.op, a, b, n);
        return arithmetic(n.op, a, b);
      }
      case "ternary": {
        condition(ctx, env, n.test, "the condition of ? :");
        const a = value(ctx, env, n.then);
        const b = value(ctx, env, n.other);
        return a === b ? a : "unknown";
      }
      default: return "unknown";
    }
  }

  function constantBound(env, e) {
    if (e.kind === "num") return true;
    if (e.kind === "unary" && e.op === "-") return constantBound(env, e.arg);
    return e.kind === "id" && !lookup(env, e.name) && constants.has(e.name);
  }

  function statement(ctx, env, s) {
    switch (s.kind) {
      case "block": {
        const inner = { names: new Map(), parent: env };
        for (const x of s.body) statement(ctx, inner, x);
        return;
      }
      case "decl":
        for (const d of s.decls) {
          const type = d.init.kind === "id" && lookup(env, d.init.name)?.type === "particle" ? "unknown" : value(ctx, env, d.init);
          declare(ctx, env, d.name, type, {}, d.tok);
        }
        return;
      case "if":
        condition(ctx, env, s.test, "the condition of if");
        statement(ctx, env, s.then);
        if (s.other) statement(ctx, env, s.other);
        return;
      case "for": {
        const [d, ...more] = s.init.decls;
        const k = d.name;
        const t = s.test;
        const u = s.update;
        const isK = (e) => e.kind === "id" && e.name === k;
        const fixed = s.init.keyword === "let" && more.length === 0 && constantBound(env, d.init) &&
          t.kind === "binary" && (t.op === "<" || t.op === "<=") && isK(t.left) && constantBound(env, t.right) && !isK(t.right) &&
          ((u.kind === "update" && u.op === "++" && !u.prefix && isK(u.target)) ||
            (u.kind === "assign" && u.op === "+=" && isK(u.target) && u.value.kind === "num" && u.value.value === 1));
        if (!fixed) add(21, `this loop's count is not fixed: ${s.shape}`, s);
        const inner = { names: new Map(), parent: env };
        declare(ctx, inner, k, "num", { loop: true }, d.tok);
        statement(ctx, inner, s.body);
        return;
      }
      case "return": {
        if (!s.value) { ctx.returns.push({ type: "void", at: s }); return; }
        const type = infer(ctx, env, s.value);
        if (type === "void" && ctx.kind !== "helper") add(11, `a ${ctx.kind} lambda returns no value`, s);
        ctx.returns.push({ type, at: s, valued: true });
        return;
      }
      case "expr": {
        const e = s.expr;
        if (e.kind === "call" || e.kind === "assign" || e.kind === "update") infer(ctx, env, e);
        else if (e.kind === "member" && e.name === "kill") add(9, "kill is a verb, written as the statement p.kill();", s);
        else { infer(ctx, env, e); add(21, "an expression on its own does nothing: a statement declares, assigns, calls, branches, loops or returns", s); }
        return;
      }
      default:
    }
  }

  function tree(name, source) {
    if (!trees.has(name)) {
      try { trees.set(name, parse(source)); } catch (e) {
        if (!(e instanceof Stop)) throw e;
        add(e.n, e.message, e.at);
        trees.set(name, null);
      }
    }
    return trees.get(name);
  }

  function helper(name, args) {
    const key = `${name}(${args.join(",")})`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, "unknown"); // also stops recursion, which the kit reports (L007)
    const before = where;
    where = `helper '${name}'`;
    let result = "unknown";
    const t = tree(name, helpers.get(name));
    if (t) {
      const ctx = { kind: "helper", returns: [] };
      const env = { names: new Map(), parent: null };
      t.params.forEach((p, k) => declare(ctx, env, p.text, args[k] ?? "unknown", {}, p));
      if (t.expression) {
        result = infer(ctx, env, t.body);
      } else {
        statement(ctx, env, t.body);
        const valued = ctx.returns.filter((r) => r.valued && r.type !== "void");
        const empty = ctx.returns.some((r) => !r.valued || r.type === "void") || falls(t.body);
        const types = [...new Set(valued.map((r) => r.type).filter((x) => x !== "unknown"))];
        if (valued.length === 0) result = "void";
        else if (empty) add(12, `helper '${name}' returns a value on some paths and nothing on others`, valued[0].at);
        else if (types.length > 1) add(12, `helper '${name}' returns different types on different paths (${types.join(" and ")})`, valued[1].at);
        else result = types[0] ?? "unknown";
      }
      if (result === "particle") add(12, `helper '${name}' returns a particle; a helper returns a number, boolean or vector`, t.body);
    }
    where = before;
    memo.set(key, result);
    return result;
  }

  const t = tree("", src);
  if (t) {
    const ctx = { kind, returns: [], expression: t.expression };
    const env = { names: new Map(), parent: null };
    const types = slotParams[kind];
    t.params.forEach((p, k) => {
      declare(ctx, env, p.text, types[k] ?? "unknown", {}, p);
      if (k >= types.length) add(21, `${kind === "update" ? "an" : "a"} ${kind} lambda takes at most ${types.length} parameters; '${p.text}' is one too many`, p);
    });
    if (t.expression) {
      if (kind !== "rate") add(11, `${kind === "update" ? "an" : "a"} ${kind} lambda has a block body { … } and returns no value`, t.body);
      infer(ctx, env, t.body);
    } else {
      statement(ctx, env, t.body);
      if (kind === "rate") {
        const bare = ctx.returns.find((r) => !r.valued);
        if (bare || falls(t.body)) add(11, "a rate returns a number on every path: this one misses a return", bare?.at ?? t.body);
      }
    }
  }
  // A broken helper is reported once, at the first lambda that reaches it.
  return found.filter((f) => {
    if (!f.helper) return true;
    if (claimed.has(f.message)) return false;
    claimed.add(f.message);
    return true;
  });
}

// What one lowering has seen: which force comes next, which helper faults are told.
const lowering = new WeakMap();

/** A slot convention that first runs the source checker over its lambda. */
function slot(kind, convention) {
  return (ref, program) => {
    let seen = lowering.get(program);
    if (!seen) lowering.set(program, (seen = { forces: 0, claimed: new Set() }));
    let source;
    let label = `the ${kind} lambda`;
    if (kind === "force") {
      const [name, text] = Object.entries(program.force ?? {})[seen.forces++] ?? [];
      source = text;
      label = `force '${name}'`;
    }
    else if (kind === "update") source = program.update;
    else source = (program.emitter ?? []).find((e) => e.emitter === ref.on)?.[kind];
    if (typeof source !== "string") return convention;
    const found = checkLambda(kind, source, program, seen.claimed, label);
    if (found.length === 0) return convention;
    const rank = (f) => { const k = RANK.indexOf(f.n); return k < 0 ? RANK.length : k; };
    const first = found.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    return `refusal ${first.n}: ${first.message}`;
  };
}

// ───────────────────────────────── The Dialect ────────────────────────────────
const num1 = () => ({ fn: { params: ["f64"], returns: "f64" } });

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64") },
  spaces: { rate: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      abs: num1(), sqrt: num1(), floor: num1(), sin: num1(), cos: num1(),
      PI: "f64",
    } },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "the counters", members: {} },
    Particle: { label: "a particle", members: {
      pos: { value: "vec2", write: true },
      vel: { value: "vec2", write: true },
      age: "f64",
      life: { value: "f64", write: true },
      size: { value: "f64", write: true },
      kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
    } },
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: { params: ["vec2"], returns: "f64", ref: (v) => Math.hypot(v[0], v[1]),
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(v[0], v[1]);" } } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: slot("rate", { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] }),
    spawn: slot("spawn", { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", may: ["write Particle", "rng", "bump Counters"] }),
    force: slot("force", { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle.vel"] }),
    update: slot("update", { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle", "destroy Particle", "bump Counters"] }),
  },
  helpers: { may: ["read Particle"] },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const counters = {};
    for (const n of Object.keys(program.counter ?? {})) counters[n] = { value: "f64", bump: true };
    const fields = {};
    for (const n of Object.keys(program.field ?? {})) if (!has(BUILTIN_FIELDS, n) && n !== "kill") fields[n] = { value: "f64", write: true };
    return { objects: { Params: { members: params }, Counters: { members: counters }, Particle: { members: fields } } };
  },
  // state: { t, maxParticles, bounds: { width, height }, emitters: [{ name, live }],
  //          counters: [{ name, value }], particles: [{ x, y }] } as the host computed it.
  text(state) {
    const { t, maxParticles, bounds, emitters, counters, particles } = state;
    const head = [`t=${t.toFixed(2)}`, `live=${particles.length}/${maxParticles}`, ...emitters.map((e) => `${e.name}=${e.live}`)];
    const lines = [head.join(" ")];
    if (counters.length > 0) lines.push(counters.map((c) => `${c.name}=${String(c.value)}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { x, y } of particles) {
      const col = Math.max(0, Math.min(39, Math.floor((x / bounds.width) * 40)));
      const row = Math.max(0, Math.min(19, Math.floor((y / bounds.height) * 20)));
      grid[row][col] += 1;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n > 9 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
