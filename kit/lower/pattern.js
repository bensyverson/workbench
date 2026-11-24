// Lowering destructuring: a struct's fields (`const { x, y } = p`) and a list's
// items by position (`const [a, b] = list`), each bound with a plain `let`.

import { itemAt, optional, showType } from "../ir/types.js";
import { didYouMean } from "./codes.js";
import { spanOf, describe } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

/**
 * The identifiers a destructuring pattern binds.
 * @param {AST.Pattern} p
 * @returns {string[]}
 */
export function patternNames(p) {
  if (p.type === "Identifier") return [p.name];
  if (p.type === "ObjectPattern") return p.properties.flatMap((q) => patternNames(q.value));
  if (p.type === "ArrayPattern") return p.elements.flatMap((q) => (q ? patternNames(q) : []));
  if (p.type === "AssignmentPattern") return patternNames(p.left);
  return [];
}

/**
 * Binds `pattern` to `value`. On failure the names are still declared, with an unknown type,
 * so their uses report nothing more.
 * @param {Lowerer} L
 * @param {AST.Pattern} pattern
 * @param {Expr} value
 * @param {"const" | "let"} kind
 */
export function bindPattern(L, pattern, value, kind) {
  const span = spanOf(pattern);
  if (pattern.type === "Identifier") {
    // A let may later hold any string, so its type is not the literal it starts with.
    const t = kind === "let" && typeof value.t === "object" && "enum" in value.t ? "str" : value.t;
    const name = L.declare(pattern.name, t, kind);
    L.emit({ k: "let", name, t, value, span });
    return;
  }
  if (pattern.type === "ObjectPattern") return objectPattern(L, pattern, value, kind);
  if (pattern.type === "ArrayPattern") return arrayPattern(L, pattern, value, kind);
  L.error("L012", pattern, "This pattern is not lowered.", "Bind names, { fields } of a struct, or [items] of a list.");
  declareAll(L, pattern, kind);
}

/**
 * @param {Lowerer} L
 * @param {AST.Pattern} pattern
 * @param {"const" | "let"} kind
 */
function declareAll(L, pattern, kind) {
  for (const n of patternNames(pattern)) L.declare(n, "unknown", kind);
}

/**
 * The value as something that can be read repeatedly: itself when a local, else a temporary.
 * @param {Lowerer} L
 * @param {Expr} value
 * @returns {Expr}
 */
function once(L, value) {
  if (value.k === "local") return value;
  const name = L.temp(value.t);
  L.emit({ k: "let", name, t: value.t, value, span: value.span });
  return L.ex({ k: "local", name, t: value.t, span: value.span });
}

/**
 * @param {Lowerer} L
 * @param {AST.ObjectPattern} pattern
 * @param {Expr} value
 * @param {"const" | "let"} kind
 */
function objectPattern(L, pattern, value, kind) {
  const t = value.t;
  if (t === "unknown") return declareAll(L, pattern, kind);
  if (typeof t !== "object" || !("struct" in t)) {
    L.error("L003", pattern, `This is ${describe(t)}, but { … } takes the fields of a struct.`, typeof t === "object" && "list" in t ? "Use [a, b] to take a list's items." : "Read each field on its own: const x = p.x;");
    return declareAll(L, pattern, kind);
  }
  const base = once(L, value);
  const optional_ = new Set(t.optional ?? []);
  for (const p of pattern.properties) {
    const key = p.key.type === "Identifier" ? p.key.name : String(/** @type {AST.Literal} */ (p.key).value);
    const ft = t.struct[key];
    if (ft === undefined) {
      const names = Object.keys(t.struct);
      L.error("L002", p.key, `${showType(t)} has no field '${key}'.`, `${didYouMean(key, names).trim()} Fields: ${names.join(", ") || "none"}.`.trim());
      declareAll(L, p.value, kind);
      continue;
    }
    const field = L.ex({ k: "field", of: base, name: key, t: optional_.has(key) ? optional(ft) : ft, span: spanOf(p) });
    bindPattern(L, p.value, field, kind);
  }
}

/**
 * @param {Lowerer} L
 * @param {AST.ArrayPattern} pattern
 * @param {Expr} value
 * @param {"const" | "let"} kind
 */
function arrayPattern(L, pattern, value, kind) {
  const t = value.t;
  if (t === "unknown") return declareAll(L, pattern, kind);
  if (typeof t !== "object" || !("list" in t)) {
    L.error("L003", pattern, `This is ${describe(t)}, but [ … ] takes the items of a list.`, typeof t === "object" && "struct" in t ? "Use { a, b } to take a struct's fields." : "Read the items with list[0], list[1].");
    return declareAll(L, pattern, kind);
  }
  const base = once(L, value);
  pattern.elements.forEach((el, i) => {
    if (!el) return;
    const at = L.ex({ k: "num", v: i, t: "f64", span: spanOf(el) });
    // Like any list index, an item may be missing unless the list is a literal and `i` is within its length.
    bindPattern(L, el, L.ex({ k: "index", of: base, index: at, t: itemAt(t, i), span: spanOf(el) }), kind);
  });
}
