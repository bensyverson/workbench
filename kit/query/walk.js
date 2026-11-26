// The one traversal every query shares: each node of a region, before its children, children in
// evaluation order. Children are listed per kind rather than found by walking an object's keys, so
// the order does not depend on how a stage happened to build a node.

/** @import { Kernel, Stmt, Expr } from "../ir/ir.js" */
/** @import { Node, Region, Visit } from "./query.js" */

const STMT_KINDS = new Set(["let", "set", "store", "bump", "do", "if", "for", "each", "push", "return", "break", "continue"]);

/**
 * Whether a node is a statement (else it is an expression). Kinds of the two never overlap.
 * @param {Node} node
 * @returns {node is Stmt}
 */
export function isStmt(node) {
  return STMT_KINDS.has(node.k);
}

/**
 * Whether a region is a whole Kernel.
 * @param {Region} region
 * @returns {region is Kernel}
 */
export function isKernel(region) {
  return !Array.isArray(region) && "ir" in region && region.ir === "kernel";
}

/**
 * The nodes a region starts from: a Kernel's body, a list's statements, or the node itself.
 * @param {Region} region
 * @returns {Node[]}
 */
export function roots(region) {
  if (Array.isArray(region)) return region;
  return isKernel(region) ? region.body : [region];
}

/**
 * Calls `visit` on every statement and expression of `region`, each before its children, children in the
 * order they run: a store's receiver before its value, a `for`'s start and test before its body and its
 * body before its update, a call's receiver before its arguments.
 * @param {Region} region
 * @param {Visit} visit
 */
export function walk(region, visit) {
  /** @param {Node} n */
  const go = (n) => {
    visit(n);
    for (const child of children(n)) go(child);
  };
  for (const n of roots(region)) go(n);
}

/**
 * @param {Node} n
 * @returns {Node[]}
 */
function children(n) {
  return isStmt(n) ? stmtChildren(n) : exprChildren(n);
}

/**
 * @param {Stmt} s
 * @returns {Node[]}
 */
function stmtChildren(s) {
  switch (s.k) {
    case "let": case "return": return s.value ? [s.value] : [];
    case "set": case "do": case "push": return [s.value];
    case "store": case "bump": return [s.place.recv, s.value];
    case "if": return [s.test, ...s.then, ...s.else];
    case "for": return [s.init, s.test, ...s.body, ...s.update];
    case "each": return [s.list, ...s.body];
    case "break": case "continue": return [];
  }
}

/**
 * @param {Expr} e
 * @returns {Node[]}
 */
function exprChildren(e) {
  switch (e.k) {
    case "num": case "str": case "bool": case "null": case "undef": case "local": case "global": case "list": return [];
    case "load": return [e.place.recv];
    case "op": return e.args;
    case "cond": return [e.test, e.then, e.else];
    case "call": return e.recv ? [e.recv, ...e.args] : e.args;
    case "method": return [e.recv, ...e.args];
    case "helper": return e.args;
    case "struct": return Object.values(e.fields);
    case "field": return [e.of];
    case "index": return [e.of, e.index];
    case "array": case "vec": return e.items;
    case "concat": return e.parts;
  }
}
