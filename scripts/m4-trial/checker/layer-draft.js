// A stand-in for kit/compose with the layer draft's API (kit/compose/README.md, "Layers (draft)"), for the layer
// dogfood's checker (leaf teBNYM). The layer is not built, so a glue written against the draft cannot load on the real
// kit. A layer-leg glue imports this module in place of kit/compose: it re-exports kit/compose, and its `compose`
// forwards every call to a real composition except the draft's own (`layer(...)`, a several-output `.show`, a layer
// passed to `.part`, `.show` or `.wire`), which it records. The checker (layer-leg.js) then judges the records against
// the draft and builds the real composition with the layer's bottom producer shown. Nothing here draws a layer.

import { compose as realCompose } from "../../../kit/compose/index.js";
import { isHandle } from "../../../kit/define/index.js";

export * from "../../../kit/compose/index.js";

/** @typedef {{ line: number }} Site */
/** @typedef {{ code: string, message: string, fix: string, line: number }} DraftDiagnostic */
/** @typedef {{ name: string, inputs: unknown[], at: Site, shorthand: boolean, out: { view: LayerHandle } }} Layer */
/** @typedef {{ layer: Layer, side: "out", name: "view" }} LayerHandle */
/** @typedef {{ kind: string, args: unknown[], at: Site }} Call */

const NAME = /^[a-z][a-z0-9-]*$/;
const LAYERS = new WeakSet();
const LAYER_HANDLES = new WeakSet();
/** @type {WeakMap<object, Recorded>} */
const RECORDS = new WeakMap();

/** @param {unknown} v @returns {v is Layer} */
export const isLayer = (v) => v !== null && typeof v === "object" && LAYERS.has(v);
/** @param {unknown} v @returns {v is LayerHandle} */
export const isLayerHandle = (v) => v !== null && typeof v === "object" && LAYER_HANDLES.has(v);

/** The glue's line on the current stack: the innermost frame in a data: URL (the page host imports a glue from one). @returns {Site} */
function site() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  const m = /data:[^\s()]+?:(\d+):\d+/.exec(stack);
  return { line: m ? Number(m[1]) : 1 };
}

/** A thrown draft diagnostic (a handle a layer lacks). @param {string} code @param {string} message @param {string} fix */
function thrown(code, message, fix) {
  return Object.assign(new Error(`${code} ${message}`), { code, fix, line: site().line });
}

/** A handle's text for messages. @param {unknown} h */
export function handleName(h) {
  if (isLayerHandle(h)) return `${h.layer.name}.out.view`;
  if (isLayer(h)) return h.name;
  if (isHandle(h)) { const x = /** @type {any} */ (h); return `${x.part}.${x.side}.${x.name}`; }
  return typeof h === "string" ? JSON.stringify(h) : String(h);
}

/** @param {Layer} l @param {"in" | "frame" | "param"} side */
const noSide = (l, side) => new Proxy({}, {
  get(_t, k) {
    if (typeof k === "symbol" || k === "then") return undefined;
    const fix = side === "frame" ? `a layer has no frame of its own: relate its bottom producer's frame with .frame` : "pass each Draw output to layer(<name>, <output>, ...), bottom first; a layer's inputs are its arguments";
    throw thrown("S111", `${l.name}.${side}.${String(k)}: a layer has no ${side === "in" ? "inputs to wire" : side === "frame" ? "frames" : "params"}`, fix);
  },
});

/**
 * The draft's `layer(<name>, <output>, <output>, ...)`: a layer over Draw outputs in painter's order. What the draft
 * refuses at the call (S102, S404) is judged by the checker, so a glue sees every problem at once.
 * @param {unknown} name @param {...unknown} inputs
 * @returns {Layer}
 */
export function layer(name, ...inputs) { return makeLayer(name, inputs, false, site()); }

/** @param {unknown} name @param {unknown[]} inputs @param {boolean} shorthand @param {Site} at @returns {Layer} */
function makeLayer(name, inputs, shorthand, at) {
  /** @type {any} */
  const l = { name, inputs, at, shorthand };
  const view = Object.freeze({ layer: l, side: "out", name: "view" });
  LAYER_HANDLES.add(view);
  l.out = new Proxy({ view }, {
    get(t, k) {
      if (k === "view") return t.view;
      if (typeof k === "symbol" || k === "then") return undefined;
      throw thrown("S111", `${String(name)}.out.${String(k)}: a layer has one output, view`, `${String(name)}.out.view`);
    },
  });
  l.in = noSide(l, "in");
  l.frame = noSide(l, "frame");
  l.param = noSide(l, "param");
  Object.freeze(l);
  LAYERS.add(l);
  return l;
}

/**
 * What a glue's composition recorded: the real composition (every call the draft does not change, forwarded), the
 * builders added, the `.frame` calls, and the draft's own calls.
 * @typedef {{ real: any, name: unknown, builders: unknown[], partCalls: Call[], frames: Call[], shows: Call[], layerParts: Call[], layerWires: Call[], wires: Call[] }} Recorded
 */

/** The record of a composition this module made, or undefined. @param {unknown} v @returns {Recorded | undefined} */
export const recordOf = (v) => (v !== null && typeof v === "object" ? RECORDS.get(v) : undefined);

/** kit/compose's `compose`, with the layer draft's calls recorded. @param {string} name */
export function compose(name) {
  const real = realCompose(name);
  /** @type {Recorded} */
  const rec = { real, name, builders: [], partCalls: [], frames: [], shows: [], layerParts: [], layerWires: [], wires: [] };
  const api = Object.freeze({
    /** @param {unknown} b */
    part(b) {
      if (isLayer(b)) rec.layerParts.push({ kind: "part", args: [b], at: site() });
      else { rec.builders.push(b); rec.partCalls.push({ kind: "part", args: [b], at: site() }); real.part(b); }
      return api;
    },
    /** @param {unknown} a @param {unknown} b @param {unknown} edge */
    frame(a, b, edge) { rec.frames.push({ kind: "frame", args: [a, b, edge], at: site() }); real.frame(a, b, edge); return api; },
    /** @param {unknown} from @param {unknown} to @param {unknown} [options] */
    wire(from, to, options) {
      if (isLayerHandle(from) || isLayer(from) || isLayerHandle(to) || isLayer(to)) rec.layerWires.push({ kind: "wire", args: [from, to, options], at: site() });
      else { rec.wires.push({ kind: "wire", args: [from, to, options], at: site() }); real.wire(from, to, options); }
      return api;
    },
    /** @param {...unknown} args */
    show(...args) {
      const at = site();
      // the shorthand's layer is made here, so the checker sees it like a named one
      const shorthand = args.length >= 2 && args.every((a) => isHandle(a) || isLayerHandle(a)) ? makeLayer("layers", args, true, at) : null;
      rec.shows.push({ kind: "show", args: shorthand ? [shorthand] : args, at });
      return api;
    },
    check() { throw new Error("the layer draft's checker builds the composition itself; a glue does not call check"); },
    build() { throw new Error("the layer draft's checker builds the composition itself; a glue does not call build"); },
    plan() { throw new Error("the layer draft's checker builds the composition itself; a glue does not call plan"); },
  });
  RECORDS.set(api, rec);
  return api;
}

export { NAME as LAYER_NAME };
