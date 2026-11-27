// A Draw output's builder (the draw-list draft, as ruled 2026-11-26): its declaration read into layers (a whole
// list, one op per item of a state list, a pen, or layers of those), each layer's source parsed (the Runtime
// Subset's S codes) and scanned for the op kinds it can hold, its max for one built Program, and the built list
// checked op by op. A builder is Bench code: kit/define lowers each layer through kit/lower for a Program, and
// kit/run runs the emitted Kernels; runDraw is handed those, and runs nothing it was not handed.

import { parseLambda, checkSubset } from "../parse/index.js";
import { OP_KINDS, typeOp, resolveColor } from "./ops.js";

/** @typedef {import("./ops.js").Op} Op */
/** @typedef {import("./ops.js").Paint} Paint */
/** A max: a whole number, or a function of the built record. @typedef {number | ((record: any) => unknown)} MaxDecl */
/** A layer: its kind, its source (what lowering reads), the state list an each layer walks, its declared max. @typedef {{ kind: "whole" | "each" | "pen", src: string, path?: string, max: MaxDecl | null, label: string }} Layer */
/** What a builder can hold: the op kinds it writes, the Draw inputs it spreads, and whether anything is hidden. @typedef {{ ops: string[], inputs: string[], open: boolean }} Kinds */
/** @typedef {{ layers: Layer[], max: MaxDecl | null, kinds: Kinds }} DrawDecl */
/** @typedef {{ code: string, message: string }} DrawProblem */

/** A Draw output's keys beside seam and note. */
export const DRAW_PORT_KEYS = Object.freeze(["seam", "note", "from", "each", "pen", "layers", "max"]);
const LAYER_KEYS = ["from", "each", "pen", "max"];

/** The ops that crossed a wire or left their builder: typed and carried already, so a builder that spreads them does not type them again. */
const CARRIED = new WeakSet();
/** Marks each op of a list as carried, and returns the list. @param {Op[]} list */
export function carryList(list) { for (const op of list) if (op && typeof op === "object") CARRIED.add(op); return list; }
/** @param {unknown} op */
export const isCarried = (op) => op !== null && typeof op === "object" && CARRIED.has(op);

/** @param {unknown} n @returns {n is number} */
const isWhole = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;
const isMax = (/** @type {unknown} */ m) => typeof m === "function" || (typeof m === "number" && Number.isInteger(m) && m >= 0);

/**
 * Reads one Draw output's declaration.
 * @param {Record<string, any>} port
 * @param {{ listMax: (path: string) => number | "open" | null, inputsName: string | null }} ctx  the state list's max at a path; the inputs global's name
 * @returns {{ decl: DrawDecl | null, problems: DrawProblem[] }}
 */
export function declareDraw(port, { listMax, inputsName }) {
  /** @type {DrawProblem[]} */
  const problems = [];
  const bad = (/** @type {string} */ message) => problems.push({ code: "J001", message });
  // a key the port does not take is kit/define's D024, said with every other port's
  if (port.max !== undefined && !isMax(port.max)) bad(`max is a whole number or a function of the built record, (record) => <n>, not ${JSON.stringify(port.max)}`);
  const ways = ["from", "pen", "layers"].filter((k) => port[k] !== undefined);
  /** @type {Layer[]} */
  const layers = [];
  if (port.each !== undefined && port.from === undefined) bad("each needs a from: (<item>, s, record) => <op> or null");
  else if (ways.length === 0) bad("a Draw output needs one builder: from, from with each, pen, or layers");
  else if (ways.length > 1) bad(`a Draw output takes one builder, not ${ways.join(" and ")}; to mix them, use layers`);
  else if (ways[0] === "layers") {
    if (!Array.isArray(port.layers) || port.layers.length === 0) bad("layers is empty: give a list of builders, { from }, { each, from } or { pen, max }");
    else port.layers.forEach((/** @type {any} */ l, /** @type {number} */ i) => {
      const label = `layers[${i}]`;
      if (!l || typeof l !== "object" || Array.isArray(l)) { bad(`${label} must be a builder: { from }, { each, from } or { pen, max }`); return; }
      const extra = Object.keys(l).filter((k) => !LAYER_KEYS.includes(k));
      if (extra.length) { bad(`${label} has no key '${extra[0]}' (a layer's keys: ${LAYER_KEYS.join(", ")})`); return; }
      const layer = layerOf(l, label, true, listMax, bad);
      if (layer) layers.push(layer);
    });
  } else {
    const layer = layerOf(port, "the builder", false, listMax, bad);
    if (layer) layers.push(layer);
  }
  // the Runtime Subset's own codes, from the parser; a type or a name is lowering's, when a Program lowers
  for (const l of layers) {
    const r = parseLambda(l.src);
    const found = r.ok && r.ast ? checkSubset(r.ast, l.src) : r.diagnostics;
    for (const d of found.filter((x) => x.severity === "error")) problems.push({ code: d.code, message: `${l.label}, line ${d.loc.start.line}: ${d.message}${d.tip ? ` (${d.tip})` : ""}` });
  }
  if (problems.length) return { decl: null, problems };
  return { decl: { layers, max: port.max ?? null, kinds: kindsOf(layers, inputsName) }, problems };
}

/**
 * @param {Record<string, any>} l @param {string} label @param {boolean} inLayers
 * @param {(path: string) => number | "open" | null} listMax @param {(m: string) => void} bad @returns {Layer | null}
 */
function layerOf(l, label, inLayers, listMax, bad) {
  const ways = ["from", "pen"].filter((k) => l[k] !== undefined);
  if (l.each !== undefined && l.from === undefined) { bad(`${label}: each needs a from: (<item>, s, record) => <op> or null`); return null; }
  if (ways.length !== 1) { bad(`${label} needs one builder: { from }, { each, from } or { pen, max }`); return null; }
  const fn = l[ways[0]];
  if (typeof fn !== "function") { bad(`${label}: ${ways[0]} is a function, not ${JSON.stringify(fn)}`); return null; }
  if (inLayers && l.max !== undefined && !isMax(l.max)) { bad(`${label}: max is a whole number or a function of the built record, not ${JSON.stringify(l.max)}`); return null; }
  if (l.each !== undefined) {
    if (typeof l.each !== "string") { bad(`${label}: each names a list in the state by its path, "<path>", not ${JSON.stringify(l.each)}`); return null; }
    const m = listMax(l.each);
    if (m === null) { bad(`${label}: each names '${l.each}', which is not a list in the state`); return null; }
    if (m === "open") { bad(`${label}: each names '${l.each}', a state list with no max; give it one, list(<item>, <max>), so the draw list has a worst case`); return null; }
    return { kind: "each", src: String(fn), path: l.each, max: m, label };
  }
  if (ways[0] === "pen") {
    if (inLayers && l.max === undefined) { bad(`${label}: a pen layer states its max, { pen, max: <n> or (record) => <n> }`); return null; }
    return { kind: "pen", src: String(fn), max: inLayers ? l.max : null, label };
  }
  return { kind: "whole", src: String(fn), max: inLayers && l.max !== undefined ? l.max : null, label };
}

/** A builder's syntax tree, or null when its source is not an arrow function kit/parse reads. @param {string} src */
function treeOf(src) {
  const r = parseLambda(src);
  return r.ok ? /** @type {any} */ (r).ast : null;
}

/** Every node under a tree, with its ancestors (nearest last). @param {any} node @param {(n: any, up: any[]) => void} visit @param {any[]} [up] */
function walk(node, visit, up = []) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, up); return; }
  if (typeof node.type === "string") visit(node, up);
  const next = typeof node.type === "string" ? [...up, node] : up;
  for (const [k, v] of Object.entries(node)) if (k !== "loc" && k !== "range") walk(v, visit, next);
}

const propName = (/** @type {any} */ m) => (m && m.type === "MemberExpression" && !m.computed && m.property.type === "Identifier" ? m.property.name : null);


/**
 * What a builder's layers can hold, from their source: a whole or each builder's returned literals (`op` a string
 * literal), a pen's calls of its op methods, and the Draw inputs a whole builder spreads (`...<inputs>.<port>`).
 * Anything else that could make an op (a helper's result, a computed tag, a pen handed on) leaves the kinds open.
 * @param {Layer[]} layers @param {string | null} inputsName @returns {Kinds}
 */
export function kindsOf(layers, inputsName) {
  /** @type {Kinds} */
  const k = { ops: [], inputs: [], open: false };
  const addOp = (/** @type {string} */ o) => { if (!k.ops.includes(o)) k.ops.push(o); };
  /** @param {any} e */
  const opsOf = (e) => {
    if (!e) return;
    switch (e.type) {
      case "ArrayExpression":
        for (const el of e.elements) if (el && el.type === "SpreadElement") spreadOf(el.argument); else opsOf(el);
        return;
      case "ObjectExpression": {
        const p = e.properties.find((/** @type {any} */ q) => q.type === "Property" && !q.computed && q.key.type === "Identifier" && q.key.name === "op");
        if (p && p.value.type === "Literal" && typeof p.value.value === "string") addOp(p.value.value); else k.open = true;
        return;
      }
      case "ConditionalExpression": opsOf(e.consequent); opsOf(e.alternate); return;
      case "LogicalExpression": opsOf(e.left); opsOf(e.right); return;
      case "Literal": if (e.value !== null) k.open = true; return;
      case "Identifier": if (e.name !== "undefined") k.open = true; return;
      default: k.open = true;
    }
  };
  /** @param {any} a */
  const spreadOf = (a) => {
    if (a.type === "MemberExpression" && a.object.type === "Identifier" && a.object.name === inputsName && propName(a)) { if (!k.inputs.includes(propName(a))) k.inputs.push(/** @type {string} */ (propName(a))); return; }
    if (a.type === "ConditionalExpression") { spreadOf(a.consequent); spreadOf(a.alternate); return; }
    opsOf(a);
  };
  for (const l of layers) {
    const tree = treeOf(l.src);
    if (!tree) { k.open = true; continue; }
    if (l.kind === "pen") {
      const pen = tree.params[1]?.type === "Identifier" ? tree.params[1].name : null;
      if (!pen) { k.open = true; continue; }
      walk(tree.body, (n, up) => {
        if (n.type !== "Identifier" || n.name !== pen) return;
        const m = up.at(-1), call = up.at(-2);
        const name = m && m.object === n ? propName(m) : null;
        if (name && OP_KINDS.includes(name) && call?.type === "CallExpression" && call.callee === m) addOp(name); else k.open = true;
      });
      continue;
    }
    if (tree.body.type !== "BlockStatement") { opsOf(tree.body); continue; }
    walk(tree.body, (n, up) => {
      // a return inside a nested function is that function's, not the builder's
      if (n.type === "ReturnStatement" && !up.some((a) => /Function/.test(a.type))) opsOf(n.argument);
    });
  }
  return k;
}

/**
 * One built Program's max for a Draw output (ruling 1): its port's `max` (a number, or a function of the record),
 * else the sum of its layers' maxes when each is known (an each layer's state list, a pen layer's own, a whole
 * layer's static max from its lowering, `lowered`), else the seam's ceiling; never past the ceiling.
 * @param {DrawDecl} decl @param {number} ceiling @param {Record<string, any>} record
 * @param {Array<number | null>} [lowered]  each layer's static max, as lowering gives it (null where it gives none)
 * @returns {{ ok: true, max: number } | { ok: false, error: string }}
 */
export function drawMax(decl, ceiling, record, lowered = []) {
  /** @param {MaxDecl} m @returns {unknown} */
  const value = (m) => (typeof m === "function" ? m(record) : m);
  /** @type {unknown} */
  let max = ceiling;
  let from = "";
  try {
    // every layer's own max is judged, a port max or not: one that is no whole number would be a silent ceiling
    for (const l of decl.layers) {
      if (l.max === null) continue;
      const v = value(l.max);
      if (!isWhole(v)) return { ok: false, error: `${l.label}: its max(record) gives ${JSON.stringify(v) ?? String(v)}; a max is a whole number of at least 0` };
    }
    if (decl.max !== null) { max = value(decl.max); from = "max(record)"; }
    else if (decl.layers.every((l, i) => l.max !== null || typeof lowered[i] === "number")) {
      const each = decl.layers.map((l, i) => (l.max !== null ? value(l.max) : lowered[i]));
      if (each.every((n) => typeof n === "number")) { max = each.reduce((/** @type {number} */ a, b) => a + /** @type {number} */ (b), 0); from = "its layers' maxes"; }
    }
  } catch (e) {
    return { ok: false, error: `its max(record) threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof max !== "number" || !Number.isInteger(max) || max < 0) return { ok: false, error: `its max for this Program is ${JSON.stringify(max)}; a max is a whole number of at least 0` };
  if (max > ceiling) return { ok: false, error: `${from || "its max"} gives ${max} ops for this Program, past the seam's ceiling (Draw<${ceiling}>); raise the ceiling, or lower the max` };
  return { ok: true, max };
}

/** The value at a dotted path. @param {any} v @param {string} path */
const at = (v, path) => path.split(".").reduce((x, k) => (x === null || x === undefined ? x : x[k]), v);

/**
 * Runs a Draw output's builder on one state: its layers in order, each through the function `fns` holds for it
 * (kit/run hands the emitted Kernels, with the inputs and the params bound as every Kernel's globals are), each op
 * typed against the part's paint, held to the layers' maxes and the list's, its colors resolved to "#rrggbbaa"
 * and its images named `<part>.<image>`. Ops a builder spreads from its Draw inputs are carried already and pass
 * as they are.
 * @param {DrawDecl} decl
 * @param {{ state: any, record: Record<string, any>, max: number, paint: Paint, part: string, fns: Array<(...args: any[]) => unknown> }} env
 * @returns {{ ok: true, list: Op[] } | { ok: false, code: string, message: string }}
 */
export function runDraw(decl, { state, record, max, paint, part, fns }) {
  /** @type {unknown[]} */
  const made = [];
  /** @type {{ code: string, message: string } | null} */
  let stop = null;
  try {
    for (const [li, l] of decl.layers.entries()) {
      const fn = fns[li];
      if (l.kind === "whole") {
        const v = fn(state, record);
        const before = made.length;
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) { for (const op of v) if (op !== null && op !== undefined) made.push(op); }
        else if (typeof v === "object") made.push(v);
        else { stop = { code: "J020", message: `${l.label} gave ${JSON.stringify(v)}; a whole builder gives an op, a list of ops or null` }; break; }
        // a layer that states its max is held to it, as a pen layer is
        const own = l.max === null ? null : typeof l.max === "function" ? l.max(record) : l.max;
        if (typeof own === "number" && made.length - before > own) stop = { code: "J021", message: `${l.label} gave ${made.length - before} ops, more than its max of ${own}` };
      } else if (l.kind === "each") {
        const items = at(state, /** @type {string} */ (l.path));
        if (!Array.isArray(items)) { stop = { code: "J020", message: `${l.label}: the state's '${l.path}' is ${JSON.stringify(items)}, not a list` }; break; }
        for (const item of items) {
          const op = fn(item, state, record);
          if (op === null || op === undefined) continue;
          if (typeof op !== "object" || Array.isArray(op)) { stop = { code: "J020", message: `${l.label} gave ${JSON.stringify(op)} for an item; an each builder gives one op or null` }; break; }
          made.push(op);
        }
      } else {
        const limit = l.max === null ? max : typeof l.max === "function" ? l.max(record) : l.max;
        if (!isWhole(limit)) { stop = { code: "J010", message: `${l.label}: its max(record) gives ${JSON.stringify(limit) ?? String(limit)}; a max is a whole number of at least 0` }; break; }
        let drawn = 0;
        const pen = Object.freeze(Object.fromEntries(OP_KINDS.map((kind) => [kind, (/** @type {Record<string, unknown>} */ fields) => {
          drawn++;
          if (drawn <= limit) made.push({ ...fields, op: kind });
        }])));
        fn(state, pen, record);
        if (drawn > limit) stop = { code: "J021", message: `${l.label} (a pen) drew ${drawn} ops, more than its max of ${limit}` };
      }
      if (stop) break;
    }
  } catch (e) {
    return { ok: false, code: "J022", message: `the builder threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (stop) return { ok: false, .../** @type {DrawProblem} */ (stop) };
  if (made.length > max) return { ok: false, code: "J021", message: `the draw list has ${made.length} ops, and its max is ${max}; a list is never truncated: raise the max, or draw fewer` };
  /** @type {Op[]} */
  const list = [];
  for (let i = 0; i < made.length; i++) {
    const op = made[i];
    if (isCarried(op)) { list.push(/** @type {Op} */ (op)); continue; }
    const problems = typeOp(op, paint);
    if (problems.length) return { ok: false, code: "J020", message: `op ${i}: ${problems.join("; ")}` };
    list.push(carryOp(/** @type {Op} */ (op), paint, part));
  }
  return { ok: true, list: carryList(list) };
}

/** An op as it leaves its part: each color "#rrggbbaa", the image named `<part>.<image>`. @param {Op} op @param {Paint} paint @param {string} part @returns {Op} */
function carryOp(op, paint, part) {
  const o = { ...op };
  for (const k of ["fill", "stroke"]) if (typeof o[k] === "string" || Array.isArray(o[k])) o[k] = resolveColor(o[k], paint.colors) ?? o[k];
  if (typeof o.image === "string") o.image = `${part}.${o.image}`;
  return o;
}
