// Draw lists in a run (the draw-list draft, as ruled 2026-11-26). After a part's init and each step, each of its
// Draw outputs is built from the state it returned (kit/draw's runDraw), with the record, its params and its value
// and Draw inputs through the inputs global (ruling 4). The lists are kept by the state object they were built
// from, so a delayed wire, which reads the snapshot as its instant began, reads that snapshot's lists too. A Draw
// wire converts its list op by op into the consumer's frame, and the page reads the shown part's list.

import { drawMax, runDraw, convertOp, carryList } from "../draw/index.js";

/** @typedef {import("../draw/ops.js").Op} Op */
/** @typedef {import("../draw/ops.js").Image} Image */
/** @typedef {import("./part.js").Part} Part */

/** Each committed state's Draw outputs, by port. @type {WeakMap<object, Record<string, readonly Op[]>>} */
const DRAWN = new WeakMap();

/** @param {any} runtime @returns {any[]} */
const drawPorts = (runtime) => Object.values(/** @type {Record<string, any>} */ (runtime.dialect.seams.out)).filter((o) => o.draw);

/**
 * Builds a part's Draw outputs from a state it is about to commit; null when they build, else the diagnostic that
 * stops the part (J010, J020–J022).
 * @param {Part} p @param {any} state @param {Record<string, unknown>} values  its value and Draw inputs
 * @returns {{ code: string, message: string } | null}
 */
export function drawAfter(p, state, values) {
  const ports = drawPorts(p.runtime);
  if (ports.length === 0 || state === null || typeof state !== "object") return null;
  const seams = p.runtime.dialect.seams;
  const def = /** @type {Record<string, any>} */ (p.runtime.dialect.def ?? {});
  /** @type {Record<string, unknown>} */
  const globals = {};
  if (seams.inputs) globals[seams.inputs.name] = Object.freeze({ ...values });
  if (typeof def.params?.name === "string") globals[def.params.name] = p.params;
  /** @type {Record<string, readonly Op[]>} */
  const drawn = {};
  for (const port of ports) {
    const where = `part '${p.name}' (${p.dialect}): out.${port.name}`;
    const m = drawMax(port.draw, port.seam.max, p.record);
    if (!m.ok) return { code: "J010", message: `${where}: ${m.error}` };
    const r = runDraw(port.draw, { state, record: p.record, max: m.max, paint: { colors: seams.colors, images: seams.images }, part: p.name, globals });
    if (!r.ok) return { code: r.code, message: `${where}: ${r.message}` };
    drawn[port.name] = deepFreezeList(r.list);
  }
  DRAWN.set(state, Object.freeze(drawn));
  return null;
}

/** @param {Op[]} list */
function deepFreezeList(list) {
  /** @param {any} v */
  const freeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) freeze(x); } return v; };
  return freeze(list);
}

/** A reader for one Draw output, as kit/run reads a value output: the list built from that state. @param {string} port */
export const drawReader = (port) => (/** @type {any} */ state) => (state && typeof state === "object" ? DRAWN.get(state)?.[port] : undefined);

/** A part's declared images, by their carried names (`<part>.<image>`). @param {string} part @param {any} runtime @returns {Record<string, Image>} */
export function imagesOf(part, runtime) {
  const images = /** @type {Record<string, Image>} */ (runtime?.dialect?.seams?.images ?? {});
  return Object.fromEntries(Object.entries(images).map(([k, v]) => [`${part}.${k}`, v]));
}

/**
 * A list carried across a Draw wire: each op converted by the wire's edge (kit/draw's convertOp), its images
 * sized from the producer's declarations.
 * @param {unknown} v @param {{ scale: number[], offset: number[], images?: Record<string, Image> }} c @returns {unknown}
 */
export function convertDraw(v, c) {
  if (!Array.isArray(v)) return v;
  return carryList(v.map((op) => convertOp(op, { scale: c.scale, offset: c.offset }, c.images ?? {})));
}

/**
 * What the page draws: the shown part's (or `part`'s) Draw output, as it stands, with every part's images and the
 * box of its frame (its extent for the built record) for a renderer.
 * @param {{ snapshot: (part: string) => { state: any } }} run @param {{ parts: Array<{ name: string, dialect: string, record: any }>, show: string | null, view?: string }} composed
 * @param {any[]} runtimes  kit/define's defineRuntime results, matched by Dialect name
 * @param {string} [part]
 * @returns {{ part: string, port: string | null, list: readonly Op[], images: Record<string, Image>, box: { min: number[], max: number[] } | null }}
 */
export function pageView(run, composed, runtimes, part) {
  const runtimeOf = (/** @type {string} */ dialect) => runtimes.find((r) => r.dialect?.name === dialect);
  /** @type {Record<string, Image>} */
  const images = {};
  for (const p of composed.parts) Object.assign(images, imagesOf(p.name, runtimeOf(p.dialect)));
  const name = part ?? composed.show;
  const cp = composed.parts.find((p) => p.name === name);
  if (!name || !cp) throw new Error(`pageView: the composition has no part '${name}'`);
  const rt = runtimeOf(cp.dialect);
  const ports = rt ? drawPorts(rt) : [];
  const port = part === undefined && composed.view ? ports.find((o) => o.name === composed.view) : ports.length === 1 ? ports[0] : ports.find((o) => o.name === "view");
  if (!port) return { part: name, port: null, list: [], images, box: null };
  const frame = rt.dialect.seams.frames[port.seam.frame];
  const box = frame?.extent ? frame.extent(cp.record) : null;
  const state = run.snapshot(name).state;
  return { part: name, port: port.name, list: drawReader(port.name)(state) ?? [], images, box };
}
