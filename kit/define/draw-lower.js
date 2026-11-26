// A Dialect's Draw builders lowered for one built Program (the draw-list draft's ruling 1: a picture is built by
// Bench code). Each layer goes through kit/lower like any Runtime Lambda, against the Dialect's environment for
// the Program: the run's state as the Dialect declares it, the record typed from its value, the params as `$`
// and the inputs global, which also holds each Draw input as a list of ops. A whole builder gives an op, a list
// of ops or null; an each builder one op or null; a pen builder calls its pen's six methods. The result is typed
// from kit/draw's op table, so an op off the table is lowering's own L003, and a whole builder's concatenation
// has a static max, its parts' maxes summed. Then each Draw output's max for this Program (J010).

import { lowerProgram } from "../lower/index.js";
import { showType } from "../ir/types.js";
import { closeLists } from "./ui/lower.js";
import { drawMax, drawTypes, PEN_OBJECT, PEN_EFFECT } from "../draw/index.js";

/** @import { Type } from "../ir/ir.js" */
/** @import { Environment, SlotDecl, SlotRef, Member } from "../lower/environment.js" */
/** @import { LowerResult, HelperResult } from "../lower/index.js" */

/**
 * One Draw output lowered: its max for this Program, and each layer's lowering result with its static max (null
 * where only the run knows it: a pen's count).
 * @typedef {{ max: number, layers: Array<{ id: string, result: LowerResult, max: number | null }> }} LoweredDraw
 */
/** @typedef {(d: { code: string, severity: "error", message: string, tip: string, port: string, lambdaLoc?: unknown }) => void} Push */

const NO_PARAMS = "(no params)";

/**
 * Lowers every Draw builder of a Dialect for one record, and gives each Draw output's max (J010) and the Library
 * units the builders call.
 * @param {any} dialect @param {Record<string, any>} record @param {Push} push
 * @returns {{ draws: Record<string, LoweredDraw>, helpers: HelperResult[] }}
 */
export function lowerDraws(dialect, record, push) {
  const ports = Object.values(/** @type {Record<string, any>} */ (dialect.seams.out)).filter((p) => p.draw);
  /** @type {Record<string, LoweredDraw>} */
  const draws = {};
  if (ports.length === 0) return { draws, helpers: [] };
  const def = /** @type {Record<string, any>} */ (dialect.def);
  const num = dialect.numberType === "f32" ? "f32" : "f64";
  const base = /** @type {Environment} */ (dialect.environment(record));
  const t = drawTypes(num);
  const state = closeLists(/** @type {Type} */ (dialect.stateTypeFor?.(record) ?? dialect.stateType ?? { struct: {} }));
  const recordT = valueType(record, num) ?? { struct: {} };
  const paramsObject = typeof def.params?.object === "string" && Object.hasOwn(base.objects, def.params.object) ? def.params.object : NO_PARAMS;
  /** @type {Record<string, any>} */
  const objects = { ...base.objects, [PEN_OBJECT]: t.pen };
  if (paramsObject === NO_PARAMS) objects[NO_PARAMS] = { label: "the params ($)", members: {} };
  const inputs = dialect.seams.inputs;
  if (inputs && objects[inputs.object]) {
    /** @type {Record<string, Member>} */
    const drawn = {};
    for (const i of Object.values(/** @type {Record<string, any>} */ (dialect.seams.in))) if (i.seam.kind === "draw") drawn[i.name] = { kind: "value", t: t.list(i.seam.max) };
    objects[inputs.object] = { ...objects[inputs.object], members: { ...objects[inputs.object].members, ...drawn } };
  }
  /** @type {Record<string, Member>} */
  const list = { ...base.list };
  if (!Object.hasOwn(list, "length")) list.length = { kind: "value", t: "f64" };
  /** @type {Map<string, SlotDecl>} */
  const decls = new Map();
  /** @type {Environment} */
  const env = { ...base, objects, list, slot: (ref) => decls.get(ref.id) ?? base.slot(ref) };
  /** @type {Array<{ port: any, i: number, layer: any, ref: SlotRef }>} */
  const units = [];
  for (const p of ports) {
    p.draw.layers.forEach((/** @type {any} */ layer, /** @type {number} */ i) => {
      const id = `ports.out.${p.name}.${p.draw.layers.length > 1 || layer.label !== "the builder" ? `layers[${i}]` : layer.kind === "pen" ? "pen" : "from"}`;
      const ref = { id, kind: "draw", on: String(dialect.name), key: layer.kind };
      decls.set(id, slotOf(layer, p, state, recordT, t));
      units.push({ port: p, i, layer, ref });
    });
  }
  // the op union printed whole is six structs long: a message names it "op" (kit/draw's table says what one holds)
  const opText = showType(t.op);
  const short = (/** @type {string} */ m) => m.split(opText).join("op");
  const srcs = units.map((u) => u.layer.src);
  const { results, helpers } = lowerProgram(env, srcs.map((src, i) => ({ src, slot: units[i].ref })), dialect.libraryFor(srcs));
  /** @type {Record<string, Array<{ id: string, result: LowerResult, max: number | null }>>} */
  const byPort = {};
  /** @type {Set<string>} */
  const failed = new Set();
  results.forEach((r, k) => {
    const { port, layer, ref } = units[k];
    const errors = r.diagnostics.filter((d) => d.severity === "error");
    for (const d of errors) push({ code: d.code, severity: "error", message: `the ${dialect.name} Dialect's output '${port.name}', ${layer.label}, line ${d.loc.start.line}: ${short(d.message)}`, tip: short(d.tip ?? ""), port: port.name, lambdaLoc: d.loc });
    if (errors.length || !r.kernel) failed.add(port.name);
    (byPort[port.name] ??= []).push({ id: ref.id, result: r, max: layer.kind === "pen" || !r.kernel ? null : returnsMax(r.kernel.body) });
  });
  for (const p of ports) {
    if (failed.has(p.name)) continue;
    const layers = byPort[p.name];
    const m = drawMax(p.draw, p.seam.max, record, layers.map((l) => l.max));
    if (m.ok) draws[p.name] = { max: m.max, layers };
    else push({ code: "J010", severity: "error", message: `the ${dialect.name} Dialect's output '${p.name}': ${m.error}`, tip: `max: (record) => <n>, at most ${p.seam.max}`, port: p.name });
  }
  return { draws, helpers };
}

/**
 * A layer's calling convention: a whole builder `(s, record)` gives an op, a list of ops (at most the seam's
 * ceiling) or null; an each builder `(item, s, record)` one op or null; a pen builder `(s, pen, record)` nothing,
 * and only it may call the pen.
 * @param {any} layer @param {any} port @param {Type} state @param {Type} recordT @param {ReturnType<typeof drawTypes>} t
 * @returns {SlotDecl}
 */
function slotOf(layer, port, state, recordT, t) {
  const why = "a builder only reads the state, the record, the params and the inputs; it never changes the run";
  const ops = /** @type {{ union: Type[] }} */ (t.op).union;
  if (layer.kind === "pen") return { params: [state, { obj: PEN_OBJECT }, recordT], returns: "void", space: "draw", forbid: [], may: [PEN_EFFECT], forbidWhy: `${why}; a pen layer adds ops through its pen` };
  if (layer.kind === "each") return { params: [itemOf(state, layer.path), state, recordT], returns: { opt: t.op }, space: "draw", forbid: [], may: [], forbidWhy: why };
  return { params: [state, recordT], returns: { opt: { union: [...ops, t.list(port.seam.max)] } }, space: "draw", forbid: [], may: [], forbidWhy: why };
}

/** The item type of the state list at a dotted path. @param {Type} state @param {string} path @returns {Type} */
function itemOf(state, path) {
  /** @type {any} */
  let x = state;
  for (const k of path.split(".")) x = x && typeof x === "object" && "struct" in x ? x.struct[k] : undefined;
  return x && typeof x === "object" && "list" in x ? x.list : "unknown";
}

/**
 * The most ops a builder's returns can give: a list its max, an op 1, null 0, the largest of a union's members.
 * Null when a return gives something else (lowering has already said so).
 * @param {any[]} body @returns {number | null}
 */
export function returnsMax(body) {
  /** @param {Type} t @returns {number | null} */
  const count = (t) => {
    if (t === "null" || t === "void") return 0;
    if (typeof t !== "object") return null;
    if ("opt" in t) return count(t.opt);
    if ("list" in t) return t.max;
    if ("struct" in t) return 1;
    if ("union" in t) { const each = t.union.map(count); return each.some((n) => n === null) ? null : Math.max(...each.map(Number)); }
    return null;
  };
  let most = 0;
  /** @param {any[]} stmts @returns {boolean} */
  const walk = (stmts) => {
    for (const s of stmts) {
      if (s.k === "return") { const n = s.value ? count(s.value.t) : 0; if (n === null) return false; most = Math.max(most, n); }
      for (const k of ["then", "else", "body"]) if (Array.isArray(s[k]) && !walk(s[k])) return false;
    }
    return true;
  };
  return walk(body) ? most : null;
}

/**
 * A record's value as a core Type, for a builder's `record` parameter: a number the Dialect's number type, a
 * list as long as the array (its length known, so `record.rows[0]` needs no check), a struct of its fields. A
 * value with no type (null, an empty or mixed array) is left out, so reading it is lowering's L002.
 * @param {unknown} v @param {"f64" | "f32"} num @returns {Type | null}
 */
export function valueType(v, num) {
  if (typeof v === "number") return num;
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  if (Array.isArray(v)) {
    const items = v.map((x) => valueType(x, num));
    if (items.length === 0 || items.some((x) => x === null)) return null;
    const one = /** @type {Type[]} */ (items).reduce((a, b) => (a === null ? null : sameList(a, b)), /** @type {Type | null} */ (items[0]));
    return one === null ? null : { list: one, max: v.length, len: v.length };
  }
  if (v !== null && typeof v === "object") {
    /** @type {Record<string, Type>} */
    const struct = {};
    for (const [k, x] of Object.entries(v)) { const t = valueType(x, num); if (t !== null) struct[k] = t; }
    return { struct };
  }
  return null;
}

/** Two items' one type: the same, or two lists of one item type, of the longer max and no known length. @param {Type} a @param {Type} b @returns {Type | null} */
function sameList(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  if (typeof a === "object" && typeof b === "object" && "list" in a && "list" in b) {
    const item = sameList(a.list, b.list);
    return item === null ? null : { list: item, max: Math.max(a.max, b.max) };
  }
  return null;
}
