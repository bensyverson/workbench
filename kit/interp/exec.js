// Statements. A block is a scope; a statement either finishes (undefined) or gives a signal
// that the enclosing loop or the kernel must act on: break, continue or return.

import { evalExpr } from "./eval.js";
import { coerce } from "./coerce.js";
import { Scope, report, step } from "./frame.js";

/** @import { Stmt } from "../ir/ir.js" */
/** @import { Frame } from "./frame.js" */
/** @import { Value } from "./interp.js" */

/**
 * What a statement hands up: leave the innermost loop, start its next pass, or leave the kernel with a value.
 * @typedef {{ signal: "break" } | { signal: "continue" } | { signal: "return", value: Value }} Signal
 */

/**
 * Runs `stmts` in a block of their own.
 * @param {Frame} f
 * @param {Stmt[]} stmts
 * @param {string} path
 * @returns {Signal | undefined}
 */
export function execBlock(f, stmts, path) {
  const outer = f.scope;
  f.scope = new Scope(outer);
  try {
    for (let i = 0; i < stmts.length; i++) {
      const sig = execStmt(f, stmts[i], `${path}[${i}]`);
      if (sig) return sig;
    }
    return undefined;
  } finally {
    f.scope = outer;
  }
}

/**
 * @param {Frame} f
 * @param {Stmt} s
 * @param {string} path
 * @returns {Signal | undefined}
 */
export function execStmt(f, s, path) {
  /** @type {Signal | undefined} */
  let sig;
  /** @type {Value} */
  let handled;
  switch (s.k) {
    case "let":
      handled = s.value ? evalExpr(f, s.value, `${path}.value`) : undefined;
      f.scope.declare(s.name, handled);
      break;
    case "set":
      handled = evalExpr(f, s.value, `${path}.value`);
      f.scope.assign(s.name, handled);
      break;
    case "push":
      handled = evalExpr(f, s.value, `${path}.value`);
      /** @type {Value[]} */ (f.scope.get(s.name)).push(handled);
      break;
    case "do": handled = evalExpr(f, s.value, `${path}.value`); break;
    case "store": {
      const recv = evalExpr(f, s.place.recv, `${path}.place.recv`);
      handled = evalExpr(f, s.value, `${path}.value`);
      const coerced = s.place.store ? coerce(s.place.store, handled) : handled;
      const host = f.m.env.host;
      if (host?.store) host.store(s.place, recv, handled, coerced);
      else /** @type {Record<string, Value>} */ (recv)[s.place.name] = coerced;
      break;
    }
    case "bump": {
      const recv = evalExpr(f, s.place.recv, `${path}.place.recv`);
      handled = evalExpr(f, s.value, `${path}.value`);
      const host = f.m.env.host;
      if (host?.bump) host.bump(s.place, recv, handled);
      else /** @type {Record<string, number>} */ (recv)[s.place.name] += /** @type {number} */ (handled);
      break;
    }
    case "return":
      handled = s.value ? evalExpr(f, s.value, `${path}.value`) : undefined;
      sig = { signal: "return", value: handled };
      break;
    case "break": sig = { signal: "break" }; break;
    case "continue": sig = { signal: "continue" }; break;
    case "if":
      sig = evalExpr(f, s.test, `${path}.test`) ? execBlock(f, s.then, `${path}.then`) : execBlock(f, s.else, `${path}.else`);
      break;
    case "for": sig = execFor(f, s, path); break;
    case "each": sig = execEach(f, s, path); break;
  }
  report(f, s, true, handled, path);
  return sig;
}

/**
 * `for (let name = init; test; update) body`.
 * @param {Frame} f
 * @param {Extract<Stmt, { k: "for" }>} s
 * @param {string} path
 * @returns {Signal | undefined}
 */
function execFor(f, s, path) {
  const outer = f.scope;
  f.scope = new Scope(outer);
  try {
    f.scope.declare(s.name, evalExpr(f, s.init, `${path}.init`));
    while (evalExpr(f, s.test, `${path}.test`)) {
      step(f.m, s.bound);
      const sig = execBlock(f, s.body, `${path}.body`);
      if (sig?.signal === "break") break;
      if (sig?.signal === "return") return sig;
      s.update.forEach((u, i) => execStmt(f, u, `${path}.update[${i}]`));
    }
    return undefined;
  } finally {
    f.scope = outer;
  }
}

/**
 * Runs `body` once per item of the list, which is at most `max` long.
 * @param {Frame} f
 * @param {Extract<Stmt, { k: "each" }>} s
 * @param {string} path
 * @returns {Signal | undefined}
 */
function execEach(f, s, path) {
  const items = Array.from(/** @type {Iterable<Value>} */ (evalExpr(f, s.list, `${path}.list`)));
  if (items.length > s.max) throw new Error(`each runs over a list of at most ${s.max}, but got ${items.length}`);
  for (const item of items) {
    step(f.m, `each ${s.name}`);
    const outer = f.scope;
    f.scope = new Scope(outer);
    try {
      f.scope.declare(s.name, item);
      const sig = execBlock(f, s.body, `${path}.body`);
      if (sig?.signal === "break") break;
      if (sig?.signal === "return") return sig;
    } finally {
      f.scope = outer;
    }
  }
  return undefined;
}
