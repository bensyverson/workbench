// Draw lists in a run (the draw-list draft, as ruled 2026-11-26). After a part's init and each step, each of its
// Draw outputs is built from the state it returned (kit/draw's runDraw), by its builder layers' compiled Kernels
// (kit/run/compile.js), with the record, and its params and its value and Draw inputs through the Kernels' globals
// (ruling 4), which the caller sets for this init or step. A part's lists are committed with its state, as its
// `draws`, and a View (what a wire reads) holds the snapshot's lists beside its state, so a delayed wire reads the
// lists as its instant began even when a step returned the very state object it was handed, and two parts that
// commit one object keep their own. A rewound part's lists are built again from its restored state and the inputs
// and params they were last built with (`redraw`, part.js): a list is a pure function of the state, the record, the
// params and the inputs. A Draw wire converts its list op by op into the consumer's frame, and the page reads the
// shown part's list; a shown layer's is its inputs' (layers.js), in the box of the producer at its bottom.

import { runDraw, convertOp, carryList, checkDraw } from "../draw/index.js";

/** @typedef {import("../draw/ops.js").Op} Op */
/** @typedef {import("../draw/ops.js").Image} Image */
/** @typedef {import("./part.js").Part} Part */
/** A part's Draw lists for one committed state, by port. @typedef {Readonly<Record<string, readonly Op[]>>} Draws */

/** The lists of a part with no Draw output, or of no state. @type {Draws} */
export const NONE = Object.freeze({});

/** @param {any} runtime @returns {any[]} */
const drawPorts = (runtime) => Object.values(/** @type {Record<string, any>} */ (runtime.dialect.seams.out)).filter((o) => o.draw);

/**
 * Builds a part's Draw outputs from a state it is about to commit: its lists by port (frozen; none for a part with
 * no Draw output), else the diagnostic that stops the part (J010, J020–J022). The caller has set the Kernels'
 * globals (`$` and the inputs, with its Draw inputs) for this init or step.
 * @param {Part} p @param {any} state
 * @returns {{ draws: Draws } | { code: string, message: string }}
 */
export function drawAfter(p, state) {
  const ports = drawPorts(p.runtime);
  if (ports.length === 0 || state === null || typeof state !== "object") return { draws: NONE };
  const seams = p.runtime.dialect.seams;
  /** @type {Record<string, readonly Op[]>} */
  const drawn = {};
  for (const port of ports) {
    const where = `part '${p.name}' (${p.dialect}): out.${port.name}`;
    const c = p.compiled.draws?.[port.name];
    if (!c) return { code: "J010", message: `${where}: its builder did not lower for this Program, so it has no list` };
    const r = runDraw(port.draw, { state, record: p.record, max: c.max, paint: { colors: seams.colors, images: seams.images }, part: p.name, fns: c.fns });
    if (!r.ok) return { code: r.code, message: `${where}: ${r.message}` };
    drawn[port.name] = deepFreezeList(r.list);
  }
  return { draws: Object.freeze(drawn) };
}

/** @param {Op[]} list */
function deepFreezeList(list) {
  /** @param {any} v */
  const freeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) freeze(x); } return v; };
  return freeze(list);
}

/** A reader for one Draw output, as kit/run reads a value output: the list of the snapshot a View holds. @param {string} port */
export const drawReader = (port) => (/** @type {any} */ _state, /** @type {unknown} */ _params, /** @type {{ draws?: Draws } | undefined} */ view) => view?.draws?.[port];

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
 * The stepping part and Draw output at the bottom of a layer, read from the composed record's wires, down through a
 * layer at the bottom; null when the record does not say (kit/run refuses such a record, N007).
 * @param {{ parts: Array<{ name: string, layer?: unknown }>, wires: Array<{ from: string, to: string }> }} composed @param {string} name
 * @returns {{ part: string, port: string } | null}
 */
function bottomOf(composed, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const w = composed.wires.find((x) => x.to === `${name}.in.0`);
  if (!w) return null;
  const [part, , port] = w.from.split(".");
  return composed.parts.find((p) => p.name === part)?.layer !== undefined ? bottomOf(composed, part, seen) : { part, port };
}

/**
 * What the page draws: the shown part's (or `part`'s) Draw output, as it stands, with every part's images and the
 * box of its frame (its extent for the built record) for a renderer. For a layer, its one output `view`, in the box
 * of the producer at its bottom, as if that producer were shown. When the composition was built with a renderer
 * profile (the composed record's `profile`), `check` is that profile's draw-time check of the list (kit/draw's
 * checkDraw: J040–J044, the counts and positions composition cannot judge), else null; the list is never trimmed to pass it.
 * @param {{ snapshot: (part: string) => { state: any, draws?: Record<string, readonly Op[]> } }} run @param {{ parts: Array<{ name: string, dialect: string, record: any, layer?: unknown }>, wires: Array<{ from: string, to: string }>, show: string | null, view?: string, profile?: import("../draw/profiles.js").Profile }} composed
 * @param {any[]} runtimes  kit/define's defineRuntime results, matched by Dialect name
 * @param {string} [part]
 * @returns {{ part: string, port: string | null, list: readonly Op[], images: Record<string, Image>, box: { min: number[], max: number[] } | null, check: ReturnType<typeof checkDraw> | null }}
 */
export function pageView(run, composed, runtimes, part) {
  const runtimeOf = (/** @type {string} */ dialect) => runtimes.find((r) => r.dialect?.name === dialect);
  /** @type {Record<string, Image>} */
  const images = {};
  for (const p of composed.parts) Object.assign(images, imagesOf(p.name, runtimeOf(p.dialect)));
  const name = part ?? composed.show;
  const cp = composed.parts.find((p) => p.name === name);
  if (!name || !cp) throw new Error(`pageView: the composition has no part '${name}'`);
  const profile = composed.profile;
  if (cp.layer !== undefined) {
    const bottom = bottomOf(composed, name);
    const bp = bottom ? composed.parts.find((p) => p.name === bottom.part) : undefined;
    const brt = bp ? runtimeOf(bp.dialect) : undefined;
    const seam = bottom ? brt?.dialect.seams.out[bottom.port]?.seam : undefined;
    const frame = seam ? brt.dialect.seams.frames[seam.frame] : undefined;
    const box = frame?.extent ? frame.extent(/** @type {any} */ (bp).record) : null;
    const list = run.snapshot(name).draws?.view ?? [];
    const check = profile ? checkDraw(profile, [...list], { images, box: box ?? { min: [0, 0], max: [0, 0] } }) : null;
    return { part: name, port: "view", list, images, box, check };
  }
  const rt = runtimeOf(cp.dialect);
  const ports = rt ? drawPorts(rt) : [];
  const port = part === undefined && composed.view ? ports.find((o) => o.name === composed.view) : ports.length === 1 ? ports[0] : ports.find((o) => o.name === "view");
  if (!port) return { part: name, port: null, list: [], images, box: null, check: null };
  const frame = rt.dialect.seams.frames[port.seam.frame];
  const box = frame?.extent ? frame.extent(cp.record) : null;
  const list = run.snapshot(name).draws?.[port.name] ?? [];
  const check = profile ? checkDraw(profile, [...list], { images, box: box ?? { min: [0, 0], max: [0, 0] } }) : null;
  return { part: name, port: port.name, list, images, box, check };
}
