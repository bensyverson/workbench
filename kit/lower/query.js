// Query callbacks (`list.filter((m) => !m.up)`) inlined as bounded loops over the
// list, so no closure exists at run time. A callback is pure and may read the
// enclosing lambda's locals.

import { optional } from "../ir/types.js";
import { check, expr, test, bad, seq } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type, Expr, Stmt, Span } from "../ir/ir.js" */
/** @import { QueryName } from "./dialect.js" */
/** @import { Lowerer } from "./lowerer.js" */

/**
 * Lowers `list.name(callback[, init])`, emitting the loop and returning its result.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @param {Expr} list
 * @param {QueryName} name
 * @returns {Expr}
 */
export function query(L, node, list, name) {
  const span = /** @type {Span} */ ([node.range[0], node.range[1]]);
  const args = /** @type {AST.Expression[]} */ (node.arguments);
  const arity = name === "reduce" ? 2 : 1;
  if (args.length !== arity) {
    L.error("L015", node, `${name} got ${args.length} argument${args.length === 1 ? "" : "s"}.`, `${name} takes ${arity === 2 ? "2 arguments: a callback (acc, item) => … and an initial value" : "1 argument: a callback"}.`);
    return bad(node);
  }
  const cb = args[0];
  const shape = name === "reduce" ? "(acc, m) => acc + m.score" : "(m) => !m.up";
  if (cb.type !== "ArrowFunctionExpression" || !cb.expression || cb.params.length !== arity || cb.params.some((p) => p.type !== "Identifier")) {
    L.error("L005", cb, `${name} needs a callback with ${arity === 2 ? "two parameters" : "one parameter"} and an expression body.`, `Write it as ${name}(${shape}${name === "reduce" ? ", 0" : ""}).`);
    return bad(node);
  }
  const lt = /** @type {Extract<Type, { list: unknown }>} */ (list.t);
  const item = lt.list;
  const params = /** @type {AST.Identifier[]} */ (cb.params);
  const body = /** @type {AST.Expression} */ (cb.body);

  let [l, init] = seq(L, [() => list, ...(name === "reduce" ? [() => expr(L, args[1])] : [])]);
  // The loop reads the list after the result's `let` holds reduce's initial value, so a list that could change or has effects is read first.
  if (name === "reduce" && !L.stable(l) && !L.stable(init)) {
    const saved = L.temp(l.t);
    L.emit({ k: "let", name: saved, t: l.t, value: l, span: l.span });
    l = L.ex({ k: "local", name: saved, t: l.t, span: l.span });
  }
  /** @type {Type} */
  const rt = name === "filter" ? { list: item, max: lt.max } : name === "find" ? optional(item) : name === "reduce" ? init.t : "bool";
  const result = L.temp(rt);
  /** @type {Expr} */
  const start = name === "filter" ? { k: "list", t: rt, span }
    : name === "find" ? { k: "undef", t: rt, span }
    : name === "reduce" ? init
    : { k: "bool", v: name === "every", t: "bool", span };
  L.emit({ k: "let", name: result, t: rt, value: L.ex(start), span });

  const local = (/** @type {string} */ n, /** @type {Type} */ t) => L.ex({ k: "local", name: n, t, span });
  const set = (/** @type {Expr} */ value) => /** @type {Stmt} */ ({ k: "set", name: result, value, span, effects: L.effectsOf(value) });
  const brk = /** @type {Stmt} */ ({ k: "break", span, effects: [] });

  let itemName = "";
  const loop = L.capture(() => {
    if (name === "reduce") L.alias(params[0].name, { name: result, t: rt, kind: "let" });
    itemName = L.declare(params[arity - 1].name, item, "const", { callback: true });
    L.pure++;
    try {
      if (name === "reduce") { L.emit({ k: "set", name: result, value: check(L, body, rt, "reduce's accumulator"), span }); return; }
      const pred = test(L, body);
      const yes = pred;
      const no = L.ex({ k: "op", op: "not", args: [pred], t: "bool", span: pred.span });
      if (name === "filter") L.emit({ k: "if", test: yes, then: [/** @type {Stmt} */ ({ k: "push", name: result, value: local(itemName, item), span, effects: [] })], else: [], span });
      if (name === "find") L.emit({ k: "if", test: yes, then: [set(local(itemName, item)), brk], else: [], span });
      if (name === "some") L.emit({ k: "if", test: yes, then: [set(L.ex({ k: "bool", v: true, t: "bool", span })), brk], else: [], span });
      if (name === "every") L.emit({ k: "if", test: no, then: [set(L.ex({ k: "bool", v: false, t: "bool", span })), brk], else: [], span });
    } finally { L.pure--; }
  });
  L.emit({ k: "each", name: itemName, t: item, list: l, max: lt.max, body: loop.stmts, span });
  return L.ex({ k: "local", name: result, t: rt, span });
}
