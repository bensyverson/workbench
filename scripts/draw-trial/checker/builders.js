// A Draw output's builder, as draw.md defines it, emulated: the declaration read into layers (a whole list, one op
// per item of a state list, a pen), its static max where the source says it, its source scanned against the
// Runtime Subset (kit/parse) and draw.md's refusals (no map and kin; only its parameters and the file's top-level
// helpers and constants), and the builder run as plain JavaScript on one state. The kit would lower it; the paper
// trial runs it and types what it makes (ops.js).

import { parseLambda, checkSubset } from "../../../kit/parse/index.js";
import { freeNames } from "../../../kit/parse/freenames.js";
import { topLevelBindings, topLevelFunctions, topLevelNames } from "../../../kit/parse/toplevel.js";
import { OPS } from "./ops.js";

/** @typedef {{ kind: "whole" | "each" | "pen", fn: Function, path?: string, max: number | null, at: string }} Layer */
/** @typedef {{ layers: Layer[], problems: string[] }} Builder */

const PORT_KEYS = ["seam", "note", "from", "each", "pen", "layers"];
const LAYER_KEYS = ["from", "each", "pen", "max"];
/** Calls a builder may not make: draw.md, "there is no map". */
export const REFUSED_CALLS = Object.freeze(["map", "flatMap", "filter", "forEach", "reduce", "push", "concat"]);

/**
 * A state list's max at `path` in a Dialect's raw `state`: a number, "open" for a list with no max, or null when
 * the path names no list.
 * @param {Record<string, any>} state @param {string} path @returns {number | "open" | null}
 */
export function listMax(state, path) {
  /** @type {any} */
  let t = { fields: state };
  for (const k of String(path).split(".")) {
    const fields = t?.fields ?? t?.members;
    if (!fields || !Object.hasOwn(fields, k)) return null;
    t = fields[k];
  }
  // kit/define's list() is { of, max }; struct() is { fields }
  if (!t || typeof t !== "object" || !Object.hasOwn(t, "of") || !Object.hasOwn(t, "max")) return null;
  return typeof t.max === "number" ? t.max : "open";
}

/**
 * One port's builder: its layers, or why it is declared badly.
 * @param {Record<string, any>} port @param {Record<string, any>} state the Dialect's raw state @param {number} seamMax
 * @returns {Builder}
 */
export function builderOf(port, state, seamMax) {
  /** @type {string[]} */
  const problems = [];
  for (const k of Object.keys(port)) if (!PORT_KEYS.includes(k)) problems.push(`a Draw port has no key '${k}' (its keys: ${PORT_KEYS.join(", ")})`);
  const ways = ["from", "pen", "layers"].filter((k) => port[k] !== undefined);
  if (port.each !== undefined && port.from === undefined) { problems.push("each needs a from: (<item>, s) => <op> or null"); return { layers: [], problems }; }
  if (ways.length === 0) { problems.push("a Draw output needs one builder: from, from with each, pen, or layers"); return { layers: [], problems }; }
  if (ways.length > 1) { problems.push(`a Draw output takes one builder, not ${ways.join(" and ")}; to mix them, use layers`); return { layers: [], problems }; }
  /** @type {Layer[]} */
  const layers = [];
  if (ways[0] === "layers") {
    if (!Array.isArray(port.layers) || port.layers.length === 0) { problems.push("layers is empty: give a list of builders"); return { layers, problems }; }
    port.layers.forEach((/** @type {any} */ l, /** @type {number} */ i) => {
      const at = `layers[${i}]`;
      if (!l || typeof l !== "object") { problems.push(`${at} must be a builder: { from }, { each, from } or { pen, max }`); return; }
      const bad = Object.keys(l).filter((k) => !LAYER_KEYS.includes(k));
      if (bad.length) { problems.push(`${at} has no key '${bad[0]}' (a layer's keys: ${LAYER_KEYS.join(", ")})`); return; }
      const layer = layerOf(l, state, at, problems, null);
      if (layer) layers.push(layer);
    });
  } else {
    const layer = layerOf(port, state, "the port", problems, seamMax);
    if (layer) layers.push(layer);
  }
  return { layers, problems };
}

/** @param {any} l @param {Record<string, any>} state @param {string} at @param {string[]} problems @param {number | null} seamMax @returns {Layer | null} */
function layerOf(l, state, at, problems, seamMax) {
  const lambda = (/** @type {unknown} */ v, /** @type {string} */ k) => { if (typeof v === "function") return true; problems.push(`${at}: ${k} must be a lambda, got ${JSON.stringify(v)}`); return false; };
  if (l.pen !== undefined) {
    if (!lambda(l.pen, "pen")) return null;
    if (l.from !== undefined || l.each !== undefined) { problems.push(`${at}: one builder, not pen and ${l.from !== undefined ? "from" : "each"}`); return null; }
    const max = seamMax ?? l.max;
    if (seamMax === null && !(Number.isInteger(l.max) && l.max >= 1)) { problems.push(`${at}: a pen layer states its max, a whole number of at least 1 (max: <max>)`); return null; }
    return { kind: "pen", fn: l.pen, max, at };
  }
  if (l.from === undefined) { problems.push(`${at}: ${l.each !== undefined ? "each needs a from" : "a builder needs from or pen"}`); return null; }
  if (!lambda(l.from, "from")) return null;
  if (l.max !== undefined && seamMax === null && l.pen === undefined) problems.push(`${at}: only a pen layer takes max`);
  if (l.each === undefined) return { kind: "whole", fn: l.from, max: null, at };
  const m = typeof l.each === "string" ? listMax(state, l.each) : null;
  if (m === null) { problems.push(`${at}: each '${l.each}' is not a list in your state: name a list(…, <max>) of your Dialect's state by its path`); return null; }
  if (m === "open") { problems.push(`${at}: each '${l.each}' is a state list that has no max, so the draw list's max is unknown: give it one, list(…, <max>)`); return null; }
  return { kind: "each", fn: l.from, path: l.each, max: m, at };
}

/**
 * The most ops a builder can make, where its source says: an each or pen layer's max; a whole layer's array
 * literal (an op 1, a spread of `<inputs>.<port>` that input's max), or a bare object literal (1). Null when any
 * layer can't tell.
 * @param {Builder} b @param {Record<string, number>} inMaxes @returns {number | null}
 */
export function staticMax(b, inMaxes) {
  let sum = 0;
  for (const l of b.layers) {
    const m = l.kind === "whole" ? wholeMax(l.fn, inMaxes) : l.max;
    if (m === null) return null;
    sum += m;
  }
  return sum;
}

/** @param {Function} fn @param {Record<string, number>} inMaxes @returns {number | null} */
function wholeMax(fn, inMaxes) {
  const r = parseLambda(String(fn));
  if (!r.ok) return null;
  const arrow = /** @type {any} */ (r.ast);
  const inputs = arrow.params?.[1]?.type === "Identifier" ? arrow.params[1].name : null;
  let body = arrow.body;
  if (body?.type === "BlockStatement") {
    const ret = body.body.length === 1 && body.body[0].type === "ReturnStatement" ? body.body[0].argument : null;
    if (!ret) return null;
    body = ret;
  }
  if (body?.type === "ObjectExpression") return 1;
  if (body?.type !== "ArrayExpression") return null;
  let n = 0;
  for (const e of body.elements) {
    if (e?.type !== "SpreadElement") { n += 1; continue; }
    const a = e.argument;
    if (inputs && a?.type === "MemberExpression" && a.object?.type === "Identifier" && a.object.name === inputs && !a.computed && Object.hasOwn(inMaxes, a.property.name)) n += inMaxes[a.property.name];
    else return null;
  }
  return n;
}

/** @typedef {{ line: number, code: string, message: string, fix: string }} Scan */

/** Every node of a tree, depth first. @param {any} node @param {(n: any) => void} visit */
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === "string") visit(node);
  for (const [k, v] of Object.entries(node)) if (k !== "loc" && k !== "range") walk(v, visit);
}

/** The line in `fileText` where `src` starts (1 when it is not found). @param {string} fileText @param {string} src */
const lineOf = (fileText, src) => { const i = fileText.indexOf(src); return i < 0 ? 1 : fileText.slice(0, i).split("\n").length; };

/**
 * A builder's source checked against the Runtime Subset and draw.md: subset breaks (kit/parse's codes), calls of
 * map and its kin (W003), and free names that are neither its parameters, `allowed` (the Dialect's globals it may
 * read) nor the file's top-level helpers and constants (W003). A helper it calls is scanned the same way, once.
 * @param {string} src @param {{ fileText: string, allowed: Set<string> }} o @param {Set<string>} [seen]
 * @returns {Scan[]}
 */
export function scanBuilder(src, { fileText, allowed }, seen = new Set()) {
  /** @type {Scan[]} */
  const out = [];
  const base = lineOf(fileText, src) - 1;
  const r = parseLambda(src);
  if (!r.ok) {
    for (const d of r.diagnostics) out.push({ line: base + (d.loc?.start.line ?? 1), code: d.code, message: d.message, fix: d.tip ?? "write the builder as one arrow function inside the Runtime Subset" });
    return out;
  }
  for (const d of checkSubset(r.ast, src)) out.push({ line: base + (d.loc?.start.line ?? 1), code: d.code, message: d.message, fix: d.tip ?? "see the Runtime Subset" });
  walk(r.ast, (n) => {
    if (n.type === "CallExpression" && n.callee?.type === "MemberExpression" && !n.callee.computed && REFUSED_CALLS.includes(n.callee.property?.name)) {
      out.push({ line: base + n.loc.start.line, code: "W003", message: `.${n.callee.property.name}(…): a builder can't turn a list into another list (draw.md: there is no map)`, fix: "draw one op per item with each, or loop with a pen" });
    }
  });
  /** @type {{ names: string[], helpers: Map<string, string> }} */
  const top = { names: [], helpers: new Map() };
  try {
    top.names = topLevelNames(fileText);
    for (const b of topLevelBindings(fileText)) if (/=>/.test(b.init)) top.helpers.set(b.name, b.init);
    for (const f of topLevelFunctions(fileText)) top.helpers.set(f.name, f.init);
  } catch { /* a file that doesn't parse is reported when it loads */ }
  for (const name of freeNames(/** @type {any} */ (r.ast))) {
    if (allowed.has(name)) continue;
    if (top.helpers.has(name)) {
      if (seen.has(name)) continue;
      seen.add(name);
      for (const d of scanBuilder(/** @type {string} */ (top.helpers.get(name)), { fileText, allowed }, seen)) out.push({ ...d, message: `in ${name}, which the builder calls: ${d.message}` });
      continue;
    }
    if (top.names.includes(name)) continue;
    out.push({ line: base + 1, code: "W003", message: `the builder reads '${name}', which it can't see: a builder reads its parameters and the file's top-level helpers and constants${allowed.size ? `, and ${[...allowed].join(", ")}` : ""}`, fix: "pass what it needs through the state, or declare it at the top of the Dialect file" });
  }
  return out;
}

/** A pen whose methods push one op each; any other property throws, naming the methods. @param {any[]} ops */
function penFor(ops) {
  const methods = Object.fromEntries(Object.keys(OPS).map((k) => [k, (/** @type {unknown} */ rec) => {
    ops.push(rec && typeof rec === "object" && !Array.isArray(rec) ? { op: k, ...rec } : { op: k, fields: rec });
  }]));
  return new Proxy(methods, { get(t, p) { if (typeof p === "string" && !Object.hasOwn(t, p)) throw new Error(`the pen has no method '${p}' (its methods: ${Object.keys(OPS).join(", ")})`); return Reflect.get(t, p); } });
}

/** @param {any} state @param {string} path */
const at = (state, path) => String(path).split(".").reduce((v, k) => v?.[k], state);

/**
 * A builder run on one state: its ops in order, and its problems (a throw, a layer past its max, a whole list that
 * is not a list or an op).
 * @param {Builder} b @param {any} state @param {Record<string, any[]>} inputs
 * @returns {{ ops: any[], problems: string[], layers: Array<{ at: string, kind: string, count: number }> }}
 */
export function runBuilder(b, state, inputs) {
  /** @type {any[]} */
  const ops = [];
  /** @type {string[]} */
  const problems = [];
  const layers = [];
  for (const l of b.layers) {
    const start = ops.length;
    try {
      if (l.kind === "whole") {
        const v = l.fn(state, inputs);
        if (Array.isArray(v)) ops.push(...v);
        else if (v && typeof v === "object") ops.push(v);
        else if (v !== null) problems.push(`${l.at}: from returned ${JSON.stringify(v)}: a whole list is an array literal of ops, or one op`);
      } else if (l.kind === "each") {
        const items = at(state, /** @type {string} */ (l.path));
        if (!Array.isArray(items)) problems.push(`${l.at}: the state has no list at '${l.path}'`);
        else for (const item of items) { const v = l.fn(item, state); if (v !== null && v !== undefined) ops.push(v); }
      } else {
        /** @type {any[]} */
        const mine = [];
        l.fn(state, penFor(mine));
        ops.push(...mine);
        if (l.max !== null && mine.length > l.max) problems.push(`${l.at}: the pen drew ${mine.length} ops, more than its max ${l.max}`);
      }
    } catch (e) {
      problems.push(`${l.at}: the builder threw: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
    }
    layers.push({ at: l.at, kind: l.kind, count: ops.length - start });
  }
  return { ops, problems, layers };
}
