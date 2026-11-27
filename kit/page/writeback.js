// Write-back (project/2026-11-27-controls-draft.md, requirement 8): a release, an action's edits or an applied edit,
// written into the Program's text as literals. kit/define's siteOf names the call (where the builder made it) and the
// argument's path; the vendored acorn (kit/parse) finds the call at that place and walks the path through object and
// array literals. Only a literal is written: anything else is refused (H011) with its text, since editing a `const`
// would move every other use of it, and the preview would not match the commit. A span that no longer holds what the
// record was built from is H012. Pure: the host owns the text and its history.

import { parseModule, walkNodes } from "../parse/module.js";
import { siteOf } from "../define/sites.js";

/** The fix every refused argument offers. */
export const LITERAL_FIX = "write the literal at the call, or declare a param and pass $.<name>";

/** @typedef {{ ok: true, text: string, retarget?: string } | { ok: false, code: "H011" | "H012", message: string, fix: string, overlap?: true }} WriteResult */
/** @typedef {{ start: number, end: number, expect: string, value: unknown, step?: number }} Edit */

/** @param {any} n */
const isNumberNode = (n) => (n?.type === "Literal" && typeof n.value === "number") || (n?.type === "UnaryExpression" && n.operator === "-" && n.argument?.type === "Literal" && typeof n.argument.value === "number");
/** The depth of a number-list literal (0 for a number), or -1 when it is not one or is ragged. @param {any} n @returns {number} */
function listDepth(n) {
  if (isNumberNode(n)) return 0;
  if (n?.type !== "ArrayExpression" || n.elements.length === 0) return -1;
  const depths = /** @type {number[]} */ (n.elements.map(listDepth));
  if (depths.some((d) => d < 0 || d !== depths[0])) return -1;
  if (depths[0] > 0) { const lens = /** @type {number[]} */ (n.elements.map((/** @type {any} */ e) => e.elements.length)); if (lens.some((l) => l !== lens[0])) return -1; }
  return depths[0] + 1;
}
/** The depth of a value that is a number or nested lists of them, or -1. @param {unknown} v @returns {number} */
function valueDepth(v) {
  if (typeof v === "number") return Number.isFinite(v) ? 0 : -1;
  if (!Array.isArray(v) || v.length === 0) return -1;
  const ds = v.map(valueDepth);
  return ds.some((d) => d < 0 || d !== ds[0]) ? -1 : ds[0] + 1;
}

/** A literal node's value (a number, `-` a number, a string, a boolean, or a list of them), or undefined. @param {any} n @returns {unknown} */
function literalValue(n) {
  if (n?.type === "Literal" && ["number", "string", "boolean"].includes(typeof n.value)) return n.value;
  if (isNumberNode(n)) return -n.argument.value;
  if (n?.type !== "ArrayExpression") return undefined;
  const items = /** @type {unknown[]} */ (n.elements.map(literalValue));
  return items.some((x) => x === undefined) ? undefined : items;
}
/** Whether two literal values are one value. @param {unknown} a @param {unknown} b @returns {boolean} */
const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => same(x, b[i])) : Object.is(a, b) || (a === 0 && b === 0));

/** The fix a stale text offers. */
const STALE_FIX = "build the text again, then drag again";

/**
 * The call the builder made at a site: the CallExpression whose callee is a member whose property starts at the site's
 * line and column (the stack's place for a method call), else the one whose property spans that column on that line.
 * @param {any} tree @param {{ loc: { start: { line: number, column: number } } }} site
 */
function callAt(tree, site) {
  const { line, column } = site.loc.start;
  /** @type {any[]} */
  const calls = [];
  walkNodes(tree, (n) => { const c = /** @type {any} */ (n); if (c.type === "CallExpression" && c.callee?.type === "MemberExpression" && c.callee.property?.loc?.start.line === line) calls.push(c); });
  return calls.find((c) => c.callee.property.loc.start.column === column)
    ?? calls.find((c) => c.callee.property.loc.start.column <= column && column <= c.callee.property.loc.end.column) ?? null;
}

/** The node at a path into an argument: through object properties (an identifier or string key) and array elements. @param {any} node @param {Array<string | number>} path */
function walkPath(node, path) {
  let n = node;
  for (const k of path) {
    if (typeof k === "number") { if (n?.type !== "ArrayExpression") return { stop: n }; n = n.elements[k]; continue; }
    if (n?.type !== "ObjectExpression") return { stop: n };
    const prop = n.properties.find((/** @type {any} */ p) => p.type === "Property" && !p.computed && ((p.key.type === "Identifier" && p.key.name === k) || (p.key.type === "Literal" && p.key.value === k)));
    if (!prop) return { stop: n };
    n = prop.value;
  }
  return { node: n };
}

/**
 * Where a target's literal is in the text, or why it cannot be written: `{ edit }`, `{ param }` (the argument is
 * `$.<name>`, a read of a param, so the target is that param), or a refusal.
 * @param {string} text @param {Record<string, any>} record @param {string} target @param {unknown} value
 * @returns {{ edit: { start: number, end: number, expect: string, kind: string } } | { param: string } | { ok: false, code: "H011" | "H012", message: string, fix: string }}
 */
function locate(text, record, target, value) {
  /** @param {string} message @returns {{ ok: false, code: "H011", message: string, fix: string }} */
  const no = (message) => ({ ok: false, code: "H011", message, fix: LITERAL_FIX });
  const site = siteOf(record, target);
  if (!site) return no(target.startsWith("param.") ? `the Program declares no param '${target.slice(6)}'` : `no call of the Program is at ${target}`);
  if (site.calls > 1) return no(`this call runs ${site.calls} times, so its argument is not one value`);
  /** @type {any} */
  let tree;
  try { tree = parseModule(text); } catch (e) { return no(`the text does not parse: ${e instanceof Error ? e.message : e}`); }
  /** @param {string} message @returns {{ ok: false, code: "H012", message: string, fix: string }} */
  const stale = (message) => ({ ok: false, code: "H012", message: `${message}: the text changed since the record was built, so nothing is written`, fix: STALE_FIX });
  const where = `line ${site.loc.start.line}, column ${site.loc.start.column + 1}`;
  const call = callAt(tree, site);
  if (!call) return stale(`no call is at ${where} of the text, where the record's ${target} was made`);
  const method = call.callee.property?.type === "Identifier" ? call.callee.property.name : call.callee.property?.value;
  if (method !== site.slot) return stale(`the call at ${where} is .${method}, not the .${site.slot} the record made there`);
  const arg = call.arguments[site.arg];
  if (!arg) return no(`the call at line ${site.loc.start.line} has no argument ${site.arg}`);
  const walked = walkPath(arg, site.path);
  if ("stop" in walked) return no(`the argument at ${target} is \`${text.slice(walked.stop?.start ?? arg.start, walked.stop?.end ?? arg.end)}\`, not a literal`);
  const n = walked.node;
  const src = text.slice(n.start, n.end);
  if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && n.object.name === "$" && n.property.type === "Identifier") return { param: n.property.name };
  const held = literalValue(n);
  if (held !== undefined && !same(held, site.source)) return stale(`the argument at ${target} is \`${src}\` in the text, and the record was built from ${JSON.stringify(site.source)}`);
  const at = { start: n.start, end: n.end, expect: src };
  if (isNumberNode(n)) return typeof value === "number" ? { edit: { ...at, kind: "number" } } : no(`the argument at ${target} is a number, and the value ${JSON.stringify(value)} is not`);
  if (n.type === "Literal" && typeof n.value === "string") return typeof value === "string" ? { edit: { ...at, kind: "string" } } : no(`the argument at ${target} is a string, and the value ${JSON.stringify(value)} is not`);
  if (n.type === "Literal" && typeof n.value === "boolean") return typeof value === "boolean" ? { edit: { ...at, kind: "boolean" } } : no(`the argument at ${target} is a boolean, and the value ${JSON.stringify(value)} is not`);
  if (n.type === "ArrayExpression") {
    const d = listDepth(n);
    if (d < 0) return no(`the argument at ${target} is \`${src}\`, not a literal list of numbers (or of lists of numbers, each the same length)`);
    if (valueDepth(value) !== d) return no(`the argument at ${target} is a list of depth ${d}, and the value ${JSON.stringify(value)} is not`);
    return { edit: { ...at, kind: "list" } };
  }
  return no(`the argument at ${target} is \`${src}\`, not a literal`);
}

/**
 * Why a target cannot be written into this text, or null: what a Grip or a Control with `to` shows as H011 (or
 * H012, when the text is not the one the record was built from).
 * @param {string} text @param {Record<string, any>} record @param {string} target
 * @returns {{ code: "H011" | "H012", message: string, fix: string } | null}
 */
export function targetProblem(text, record, target) {
  const site = siteOf(record, target);
  const r = locate(text, record, target, site?.value);
  if ("ok" in r) return { code: r.code, message: r.message, fix: r.fix };
  if ("param" in r) return targetProblem(text, record, `param.${r.param}`);
  return null;
}

/**
 * Several targets written at once, as one edit of the text (an action's edits): every span found in the text as it
 * is, then applied from the end. A `$.<name>` argument writes its param's declared value (`retarget`).
 * @param {string} text @param {Record<string, any>} record @param {Array<{ to: string, value: unknown, step?: number }>} edits
 * @returns {WriteResult}
 */
export function writeBackAll(text, record, edits) {
  /** @type {Edit[]} */
  const spans = [];
  /** @type {string | undefined} */
  let retarget;
  for (const e of edits) {
    let to = e.to;
    let r = locate(text, record, to, e.value);
    if ("param" in r) { to = `param.${r.param}`; retarget = to; r = locate(text, record, to, e.value); }
    if ("ok" in r) return r;
    if ("param" in r) return { ok: false, code: "H011", message: `the param's declared value at ${to} is another param`, fix: LITERAL_FIX };
    spans.push({ start: r.edit.start, end: r.edit.end, expect: r.edit.expect, value: e.value, ...(e.step ? { step: e.step } : {}) });
  }
  const out = editSource(text, spans);
  return out.ok && retarget ? { ...out, retarget } : out;
}

/**
 * One target's value written into the text as a literal.
 * @param {string} text @param {Record<string, any>} record @param {string} target @param {unknown} value @param {{ step?: number }} [o]
 * @returns {WriteResult}
 */
export const writeBack = (text, record, target, value, o = {}) => writeBackAll(text, record, [{ to: target, value, ...(o.step ? { step: o.step } : {}) }]);

/**
 * A number as the text writes it: the shortest text that reads back as it, or to the step's decimals.
 * @param {number} n @param {number} [step]
 */
export function printNumber(n, step) {
  if (!step) return String(Object.is(n, -0) ? 0 : n);
  // the step's decimals from its exponent form, which String() gives below 1e-6 ("1e-7" has seven)
  const [mantissa, exponent] = step.toExponential().split("e");
  const decimals = Math.min(100, Math.max(0, (mantissa.split(".")[1] ?? "").length - Number(exponent)));
  return String(Number((Math.round(n / step) * step).toFixed(decimals)));
}

/** A value as a literal: a number, a string in the given quote, a boolean, or a list of them. @param {unknown} v @param {string} quote @param {number} [step] @returns {string} */
function literal(v, quote, step) {
  if (typeof v === "number") return printNumber(v, step);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return `${quote}${v.replace(/\\/g, "\\\\").replaceAll(quote, `\\${quote}`).replace(/\n/g, "\\n").replace(/\r/g, "\\r")}${quote}`;
  if (Array.isArray(v)) return `[${v.map((x) => literal(x, quote, step)).join(", ")}]`;
  throw new TypeError(`write-back writes a number, a string, a boolean or a list of them, not ${JSON.stringify(v)}`);
}

/**
 * Edits applied to a text, from the end so no span moves another: each span must still hold what it held (H012).
 * @param {string} text @param {Edit[]} edits
 * @returns {WriteResult}
 */
export function editSource(text, edits) {
  let out = text;
  const order = [...edits].sort((a, b) => b.start - a.start);
  // two spans that share text would each be written at the offsets of the text before the other: a text no edit asked for
  for (let i = 1; i < order.length; i++) {
    const later = order[i - 1], e = order[i];
    if (e.end > later.start) return { ok: false, code: "H011", message: `two edits overlap at ${later.start}..${Math.min(e.end, later.end)} (\`${text.slice(e.start, e.end)}\` and \`${text.slice(later.start, later.end)}\`): one target twice, or a list and a part of it, is not one value`, fix: "write each place once: the whole list, or its parts", overlap: true };
  }
  for (const e of order) {
    if (text.slice(e.start, e.end) !== e.expect) return { ok: false, code: "H012", message: `the text at ${e.start}..${e.end} is \`${text.slice(e.start, e.end)}\`, not \`${e.expect}\`: it changed since the record was built, so nothing is written`, fix: "build the text again, then drag again" };
    const quote = /^['"`]/.test(e.expect) ? e.expect[0] : '"';
    out = out.slice(0, e.start) + literal(e.value, quote, e.step) + out.slice(e.end);
  }
  return { ok: true, text: out };
}
