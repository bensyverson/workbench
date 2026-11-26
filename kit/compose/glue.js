// A glue program's text, read from its syntax tree before it runs, by kit/package's own parser: its imports (it may
// import "kit/compose", "kit/define" and the workbench's packages by their names (`import { maze } from "maze"`),
// nothing else, and no dynamic import expression; the host resolves each package name to that package's Grammar
// entry, so there is no second resolver) and every test or comparison of a handle. A handle names a port or a
// frame and is never a value at build time: an object is always truthy and never equal to undefined or null, so
// `if (level.out.picked)` silently takes one side. Arithmetic and ordering are caught as they run, by the handle's
// toPrimitive trap (kit/define/handles.js); a test cannot be, so the scan reports it (S301) at its line.

import { scanImports } from "../package/imports.js";
import { parseModule, walkNodes } from "../parse/module.js";

/** The specifiers every glue program may import besides its packages. */
export const GLUE_SPECIFIERS = Object.freeze(["kit/compose", "kit/define"]);

/** @typedef {{ code: "S301", severity: "error", message: string, fix: string, file: string, line: number }} GlueDiagnostic */

const SIDES = ["out", "in", "frame"];
const EQUALITY = ["===", "!==", "==", "!="];
/** Binary operators that compare, or ask about membership of, a value: a handle there is never what the author meant. */
const COMPARISONS = [...EQUALITY, "in", "instanceof"];
const LOGICAL = ["&&", "||", "??"];

/**
 * A member chain ending `.out.X`, `.in.X` or `.frame.X` (`level.out.picked`, `a.out?.x`, `a.out["x"]`): its text and node, or null.
 * @param {any} n @returns {{ text: string, node: any } | null}
 */
function handleChain(n) {
  const node = n?.type === "ChainExpression" ? n.expression : n;
  /** @param {any} m @returns {string | null} */
  const prop = (m) => (m?.type !== "MemberExpression" ? null : !m.computed && m.property.type === "Identifier" ? m.property.name : m.computed && m.property.type === "Literal" && typeof m.property.value === "string" ? m.property.value : null);
  /** @param {any} m @returns {string | null} */
  const text = (m) => {
    if (m?.type === "Identifier") return m.name;
    if (m?.type === "ThisExpression") return "this";
    const p = prop(m);
    const o = p === null ? null : text(m.object);
    return p === null || o === null ? null : `${o}.${p}`;
  };
  const side = prop(node?.object);
  const t = prop(node) !== null && side !== null && SIDES.includes(side) ? text(node) : null;
  return t === null ? null : { text: t, node };
}

/**
 * @param {string} text  the glue program's source @param {string[]} packages  the workbench's package names
 * @param {string} [path]  how messages name the file
 * @returns {{ imports: ReturnType<typeof scanImports>["imports"], diagnostics: Array<ReturnType<typeof scanImports>["diagnostics"][number] | GlueDiagnostic> }}
 *   each import's `resolved` is its bare name; refusals are kit/package's K007, each handle test is S301
 */
export function scanGlue(text, packages, path = "workbench.js") {
  const scanned = scanImports(path, text, [], { bare: [...GLUE_SPECIFIERS, ...packages], who: "a glue program" });
  /** @type {GlueDiagnostic[]} */
  const tested = [];
  /** @type {ReturnType<typeof parseModule>} */
  let tree;
  try { tree = parseModule(text); } catch { return scanned; } // scanImports said K007
  /** @type {Set<any>} */
  const seen = new Set();
  /** @param {any} at @param {string} handle @param {string} how */
  const report = (at, handle, how) => tested.push({ code: "S301", severity: "error", message: `${handle} is ${how} at build time; a handle is not a value: it only names a port or a frame, for .wire and .frame`, fix: "pass the handle to .wire or .frame; values flow only when the parts run, so the glue cannot branch on one", file: path, line: at.loc?.start.line ?? 1 });
  /** A handle chain tested, once, at its own line; whether `e` is one. @param {any} e */
  const hit = (e) => {
    const c = handleChain(e);
    if (c === null) return false;
    if (!seen.has(c.node)) { seen.add(c.node); report(c.node, c.text, "tested or compared"); }
    return true;
  };
  /**
   * An expression in a test position: a handle there is tested; so is a logical's left operand and, when the logical
   * itself is in a test position, its right (otherwise the right is the logical's result, a value that may be a handle).
   * @param {any} e @param {boolean} inTest
   */
  const check = (e, inTest) => {
    if (e?.type === "LogicalExpression" && LOGICAL.includes(e.operator)) { check(e.left, true); check(e.right, inTest); }
    else if (e?.type === "SequenceExpression") check(e.expressions[e.expressions.length - 1], inTest); // only the last value flows on
    else if (e?.type === "ConditionalExpression" && inTest) { check(e.consequent, true); check(e.alternate, true); }
    else if (inTest) hit(e);
  };
  /**
   * An operand of a comparison: whatever it may evaluate to is compared, so look through a logical, a ternary's arms
   * and a sequence's last value; whether a handle was found.
   * @param {any} e @returns {boolean}
   */
  const compared = (e) => {
    if (e?.type === "LogicalExpression" && LOGICAL.includes(e.operator)) return compared(e.left) || compared(e.right);
    if (e?.type === "SequenceExpression") return compared(e.expressions[e.expressions.length - 1]);
    if (e?.type === "ConditionalExpression") return compared(e.consequent) || compared(e.alternate);
    return hit(e);
  };
  walkNodes(tree, (n) => {
    const node = /** @type {any} */ (n);
    switch (node.type) {
      case "IfStatement": case "ConditionalExpression": case "WhileStatement": case "DoWhileStatement": case "ForStatement":
        if (node.test) check(node.test, true);
        break;
      case "UnaryExpression":
        if (node.operator === "!" || node.operator === "typeof") check(node.argument, true);
        break;
      case "LogicalExpression":
        check(node, false);
        break;
      case "BinaryExpression":
        if (COMPARISONS.includes(node.operator)) { void (compared(node.left) || compared(node.right)); }
        break;
      case "SwitchStatement":
        check(node.discriminant, true);
        for (const c of node.cases) if (c.test) compared(c.test);
        break;
    }
  });
  tested.sort((a, b) => a.line - b.line);
  return { imports: scanned.imports, diagnostics: [...scanned.diagnostics, ...tested] };
}
