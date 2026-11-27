// Lowering statements: declarations, ifs (with narrowing), bounded for loops,
// returns, and expressions evaluated for their effects.

import { assignable, exactLimit, join } from "../ir/types.js";
import { expr, exprMaybeEmpty, keptEmpty, test, facts, check, describe } from "./expr.js";
import { assign, update } from "./assign.js";
import { bindPattern, patternNames } from "./pattern.js";
import { settle, clash } from "./numeric.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr, Stmt, Span, Type } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

/** @param {AST.Node} n @returns {Span} */
const spanOf = (n) => [n.range[0], n.range[1]];

/**
 * @param {Lowerer} L
 * @param {AST.Statement[]} body
 */
export function statements(L, body) {
  // A block's names are dead from its first statement until their declarations run, as in JavaScript.
  L.hoist(body.flatMap((s) => (s.type === "VariableDeclaration" ? s.declarations.flatMap((d) => patternNames(d.id)) : [])));
  for (const s of body) statement(L, s);
}

/**
 * @param {Lowerer} L
 * @param {AST.Statement} node
 */
export function statement(L, node) {
  const span = spanOf(node);
  switch (node.type) {
    case "ExpressionStatement": return effect(L, node.expression);
    case "VariableDeclaration": return declaration(L, node);
    case "IfStatement": return ifStatement(L, node.test, node.consequent, node.alternate, span);
    case "BlockStatement": return L.scoped(() => statements(L, node.body));
    case "ForStatement": return forStatement(L, node);
    case "ReturnStatement": return returnStatement(L, node);
    case "BreakStatement": case "ContinueStatement":
      L.emit({ k: node.type === "BreakStatement" ? "break" : "continue", span });
      return;
    case "EmptyStatement": return;
    case "ForOfStatement": return forOf(L, node);
    default:
      L.error("L012", node, `${node.type} is not lowered.`, "Rewrite it with the constructs in the runtime subset.");
  }
}

/**
 * An expression evaluated for its effects: stores without temporaries, `a && f()` as an if.
 * @param {Lowerer} L
 * @param {AST.Expression} node
 */
export function effect(L, node) {
  const span = spanOf(node);
  if (node.type === "AssignmentExpression") { assign(L, node, false); return; }
  if (node.type === "UpdateExpression") { update(L, node, false); return; }
  if (node.type === "LogicalExpression" && node.operator !== "??") {
    const f = facts(L, node.left);
    const c = test(L, node.left);
    const guard = node.operator === "&&" ? c : L.ex({ k: "op", op: "not", args: [c], t: "bool", span: c.span });
    const then = L.capture(() => effect(L, node.right), node.operator === "&&" ? f.yes : f.no).stmts;
    L.emit({ k: "if", test: guard, then, else: [], span });
    return;
  }
  if (node.type === "ConditionalExpression") {
    const f = facts(L, node.test);
    const c = test(L, node.test);
    const then = L.capture(() => effect(L, node.consequent), f.yes).stmts;
    const els = L.capture(() => effect(L, node.alternate), f.no).stmts;
    L.emit({ k: "if", test: c, then, else: els, span });
    return;
  }
  L.emit({ k: "do", value: expr(L, node), span });
}

/**
 * @param {Lowerer} L
 * @param {AST.VariableDeclaration} node
 */
function declaration(L, node) {
  for (const d of node.declarations) {
    // On failure the names are still declared, with an unknown type, so their uses report nothing more.
    if (!d.init) {
      const first = patternNames(d.id)[0] ?? "x";
      L.error("L012", d, `'${first}' has no initial value.`, `Give it one: let ${first} = 0;`);
      for (const n of patternNames(d.id)) L.declare(n, "unknown", "let");
      continue;
    }
    const v = settle(L, exprMaybeEmpty(L, d.init));
    const kind = node.kind === "const" ? "const" : "let";
    if (d.id.type === "Identifier") {
      // A let may later hold any string, so its type is not the literal it starts with.
      const t = kind === "let" && typeof v.t === "object" && "enum" in v.t ? "str" : v.t;
      const name = L.declare(d.id.name, t, kind);
      L.emit({ k: "let", name, t, value: v, span: spanOf(d) });
      // A const bound to a loop-index read is possibly empty by type, as before, but is known present.
      if (kind === "const" && keptEmpty.has(d.init) && typeof t === "object" && "opt" in t) { L.narrowed.add(name); L.presumed.add(name); }
    } else bindPattern(L, d.id, v, kind);
  }
}

/**
 * `for (const x of list)`: an `each` loop over a bounded list. The body is lowered even when the
 * list is not one, so errors inside it still show. A destructured binding is taken apart in the body.
 * @param {Lowerer} L
 * @param {AST.ForOfStatement} node
 */
function forOf(L, node) {
  const decl = node.left.type === "VariableDeclaration" && node.left.declarations.length === 1 ? node.left : null;
  const target = decl?.declarations[0].id ?? null;
  const list = L.deadZone(target ? patternNames(target) : [], () => expr(L, node.right));
  /** @type {Type} */
  let item = "unknown";
  let max = 0;
  if (typeof list.t === "object" && "list" in list.t) { item = list.t.list; max = list.t.max; }
  else if (list.t !== "unknown") L.error("L003", node.right, `for…of needs a list, not ${describe(list.t)}.`, "Loop over a declared list (w.board, w.pool(name)), a filter result, or use a counted for loop.");
  if (!target || !decl) {
    L.error("L012", node.left, "A for…of needs its own binding.", "Declare it: for (const x of list).");
  } else if (decl.kind !== "const") {
    L.error("L012", node.left, "A for…of binding must be const.", "Write for (const x of list); the item is not reassigned.");
  }
  let name = "";
  const body = L.capture(() => {
    if (target?.type === "Identifier") name = L.declare(target.name, item, "const");
    else {
      name = L.temp(item);
      const local = L.ex({ k: "local", name, t: item, span: spanOf(node.left) });
      if (target) bindPattern(L, target, local, "const");
    }
    statement(L, node.body);
  });
  if (target && decl?.kind === "const") L.emit({ k: "each", name, t: item, list, max, body: body.stmts, span: spanOf(node) });
}

/**
 * Whether control never falls off the end of `stmts`.
 * @param {Stmt[]} stmts
 * @returns {boolean}
 */
export function terminates(stmts) {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  if (last.k === "return" || last.k === "break" || last.k === "continue") return true;
  return last.k === "if" && terminates(last.then) && terminates(last.else);
}

/**
 * `if (a && b) s` with no else becomes `if (a) { if (b) s }`, so `b` runs only when `a` holds.
 * After an if whose branch always exits, what the test proved holds for the rest of the block.
 * @param {Lowerer} L
 * @param {AST.Expression} testNode
 * @param {AST.Statement} consequent
 * @param {AST.Statement | null} alternate
 * @param {Span} span
 */
function ifStatement(L, testNode, consequent, alternate, span) {
  const f = facts(L, testNode);
  if (!alternate && testNode.type === "LogicalExpression" && testNode.operator === "&&") {
    const c = test(L, testNode.left);
    const left = facts(L, testNode.left);
    const then = L.capture(() => ifStatement(L, testNode.right, consequent, null, span), left.yes).stmts;
    L.emit({ k: "if", test: c, then, else: [], span });
    return;
  }
  const c = test(L, testNode);
  const then = L.capture(() => statement(L, consequent), f.yes).stmts;
  const els = alternate ? L.capture(() => statement(L, alternate), f.no).stmts : [];
  L.emit({ k: "if", test: c, then, else: els, span });
  if (terminates(then) && !terminates(els)) for (const n of f.no) L.narrowed.add(n);
  if (alternate && terminates(els) && !terminates(then)) for (const n of f.yes) L.narrowed.add(n);
}

/**
 * A counted loop: `for (let i = a; i < B; i++)`, with `a` an integer literal or a param,
 * B a constant, a param or a list's length, and `i` left alone by the body. The
 * counter then steps by one toward a bound it reaches, so the loop ends.
 * @param {Lowerer} L
 * @param {AST.ForStatement} node
 */
function forStatement(L, node) {
  const tip = L.environment.tips?.loopBound ?? "Count with for (let i = 0; i < n; i++), starting from an integer, where n is a constant, a list's length or a member its Dialect declares a size, and leave i alone in the body.";
  const init = node.init;
  const d = init?.type === "VariableDeclaration" && init.kind === "let" && init.declarations.length === 1 ? init.declarations[0] : null;
  const i = d && d.id.type === "Identifier" && d.init ? d.id.name : null;
  const t = node.test;
  const boundNode = i && t?.type === "BinaryExpression" && (t.operator === "<" || t.operator === "<=") && t.left.type === "Identifier" && t.left.name === i ? t.right : null;
  const u = node.update;
  const counts = i && u && ((u.type === "UpdateExpression" && u.operator === "++" && u.argument.type === "Identifier" && u.argument.name === i)
    || (u.type === "AssignmentExpression" && u.operator === "+=" && u.left.type === "Identifier" && u.left.name === i && u.right.type === "Literal" && u.right.value === 1));
  if (d && i && boundNode && u && !counts) {
    // The counted rewrite keeps the step at one: count the iterations, and derive the value from the count.
    L.error("L007", u, `This loop steps '${i}' by something other than one, so its bound cannot be checked.`,
      `Count the iterations and compute the value inside the loop: for (let k = 0; k < n; k++) { const ${i} = start + k * step; … }.`);
    return;
  }
  if (!d || !i || !boundNode || !counts || !t || !u) { L.error("L007", node, "This loop's bound cannot be checked.", tip); return; }
  const writer = findWrite(node.body, i);
  if (writer) { L.error("L007", writer, `The loop body changes '${i}', so its bound cannot be checked.`, tip); return; }
  L.scoped(() => {
    const counter = L.environment.numberType ?? "f64";
    const start = check(L, /** @type {AST.Expression} */ (d.init), counter, `'${i}'`);
    if (!startOf(start)) { L.error("L007", /** @type {AST.Expression} */ (d.init), `'${i}' must start at an integer or a param for the loop's bound to be checked.`, tip); return; }
    const name = L.declare(i, counter, "let");
    const mark = L.out.length;
    const cond = test(L, t);
    if (L.out.length > mark) { L.error("L007", t, "This loop's test needs statements of its own.", tip); return; }
    const bound = boundOf(cond);
    if (!bound) {
      const b = cond.k === "op" ? cond.args[1] : null;
      if (b?.k === "load") {
        // A read-only member (a Definition API param such as $.n) could hold any number unless its Dialect declares it a size.
        const written = L.src.slice(boundNode.range[0], boundNode.range[1]);
        L.error("L007", boundNode, `'${written}' is not declared a size, so it could hold any number and the loop might not end.`, L.environment.tips?.size ?? "Bound the loop by a constant or a list's length. A member can bound it only when the Dialect's author declares it a size, { value: \"f64\", size: true }; until then, count to a constant.");
      } else L.error("L007", boundNode, "This loop's bound is not a constant, a param or a declared size.", tip);
      return;
    }
    const step = L.capture(() => effect(L, u)).stmts;
    const list = narrowsTo(node, start, cond);
    if (list) L.countsTo.set(name, list);
    const body = L.capture(() => statement(L, node.body)).stmts;
    L.countsTo.delete(name);
    L.emit({ k: "for", name, init: start, test: cond, update: step, body, bound, span: spanOf(node) });
  });
}

/**
 * The unique name of the list a counted loop runs to the end of, so `xs[i]` in its body is not empty, or null. The
 * loop must test `i < xs.length` on a local list, start at a whole number from zero up, and leave the list alone
 * (the counter is checked already: L007).
 * @param {AST.ForStatement} node
 * @param {Expr} start
 * @param {Expr} cond
 * @returns {string | null}
 */
function narrowsTo(node, start, cond) {
  const b = cond.k === "op" && cond.op === "lt" ? cond.args[1] : null;
  const listNode = node.test?.type === "BinaryExpression" && node.test.right.type === "MemberExpression" ? node.test.right.object : null;
  if (!(b && b.k === "field" && b.name === "length" && b.of.k === "local" && listNode?.type === "Identifier")) return null;
  if (!(start.k === "num" && Number.isInteger(start.v) && start.v >= 0)) return null;
  return findWrite(node.body, listNode.name) ? null : b.of.name;
}

/**
 * Names what bounds `i < B`, or null when B is not a constant, a param, or a declared size.
 * @param {Expr} cond
 */
function boundOf(cond) {
  if (cond.k !== "op") return null;
  const b = cond.args[1];
  // Past the counter type's exact range, i++ stops changing i, so a larger bound is never reached.
  if (b.k === "num") return Math.abs(b.v) <= exactLimit(b.t) ? `const ${b.v}` : null;
  if (b.k === "call" && b.args[0]?.k === "str" && b.fn.endsWith(".param")) return `param ${b.args[0].v}`;
  if (b.k === "field" && b.name === "length" && typeof b.of.t === "object" && "list" in b.of.t) return `size ≤ ${b.of.t.max}`;
  if (b.k === "load" && b.place.size) return `size ${b.place.name}`;
  return null;
}

/**
 * Whether a loop counter's start is an integer literal (possibly negated) its number type holds exactly, or a param.
 * @param {Expr} e
 */
function startOf(e) {
  const n = e.k === "op" && e.op === "neg" ? e.args[0] : e;
  if (n.k === "num") return Number.isInteger(n.v) && Math.abs(n.v) <= exactLimit(e.t);
  return e.k === "call" && e.args[0]?.k === "str" && e.fn.endsWith(".param");
}

/**
 * The first node in `body` that assigns or updates the identifier `name`.
 * @param {unknown} body
 * @param {string} name
 * @returns {AST.Node | null}
 */
function findWrite(body, name) {
  if (Array.isArray(body)) { for (const b of body) { const f = findWrite(b, name); if (f) return f; } return null; }
  if (!body || typeof body !== "object") return null;
  const n = /** @type {AST.Node} */ (body);
  if ((n.type === "AssignmentExpression" && n.left.type === "Identifier" && n.left.name === name)
    || (n.type === "UpdateExpression" && n.argument.type === "Identifier" && n.argument.name === name)) return n;
  for (const [k, v] of Object.entries(n)) {
    if (k === "loc" || k === "range") continue;
    const f = findWrite(v, name);
    if (f) return f;
  }
  return null;
}

/**
 * @param {Lowerer} L
 * @param {AST.ReturnStatement} node
 */
function returnStatement(L, node) {
  const span = spanOf(node);
  const want = L.decl.returns;
  if (want === "infer") {
    let v = node.argument ? expr(L, node.argument) : null;
    // A baked constant's value stays untyped until each use.
    if (v && L.slot.kind !== "const") v = settle(L, v);
    if (v && node.argument) {
      const text = L.src.slice(node.argument.range[0], node.argument.range[1]);
      for (const before of L.returns) if (clash(L, node, before, v.t, "This return and an earlier return are", null, text)) break;
    }
    L.returns.push(v ? v.t : "void");
    if (!v) L.bareReturns.push(node);
    L.emit({ k: "return", value: v, span });
    return;
  }
  if (!node.argument) {
    if (want !== "void" && !assignable("null", want)) L.error("L003", node, `A ${L.slot.kind} must return ${want}.`, "Return a value.");
    L.emit({ k: "return", value: null, span });
    return;
  }
  if (want === "void") {
    // `return w.end("x")` returns the call's undefined: the call, then a plain return.
    const v = expr(L, node.argument);
    if (v.t !== "void" && v.t !== "unknown") { L.error("L003", node.argument, `A ${L.slot.kind} returns nothing.`, "Drop the value: return;"); return; }
    L.emit({ k: "do", value: v, span });
    L.emit({ k: "return", value: null, span });
    return;
  }
  L.emit({ k: "return", value: check(L, node.argument, want, `a ${L.slot.kind}'s result`), span });
}

/**
 * The inferred return type of a method: the join of its returns, and void if it can fall off the end (unless that
 * was already reported as a missing return, which would only add a second diagnostic at each call).
 * @param {Lowerer} L
 * @param {Stmt[]} body
 * @param {boolean} [reported]  the end of the body was refused as a missing return
 * @returns {Type}
 */
export function inferredReturn(L, body, reported = false) {
  const all = terminates(body) || reported ? L.returns : [...L.returns, /** @type {Type} */ ("void")];
  return all.reduce((a, b) => join(a, b));
}
