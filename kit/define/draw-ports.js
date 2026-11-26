// A Dialect's Draw ports and paint (the draw-list draft, as ruled 2026-11-26): a Draw output's builder read by
// kit/draw (J001, J002), a Draw input (an empty list unwired; J001), the `colors` and `images` keys (J003), and,
// once a Program is built, each Draw output's max for it (J010). ports.js and port-lower.js call these.

import { declareDraw, drawMax, checkPaint, DRAW_PORT_KEYS } from "../draw/index.js";
import { TAG } from "./tags.js";

/** @import { Seam } from "../seam/seam.js" */
/** @typedef {(code: string, path: Array<string | number>, message: string, tip: string) => void} Add */

/** The keys a Draw output takes, for the key check ports.js makes before it parses the seam. */
export const DRAW_OUT_KEYS = DRAW_PORT_KEYS;
/** Whether a port's seam text is a draw list's, read before it parses. @param {unknown} seam */
export const looksDraw = (seam) => typeof seam === "string" && /^\s*Draw\b/.test(seam);

/**
 * A state list's max at a dotted path in a Dialect's raw state: its max, "open" for a list without one, or null
 * when the path names no list.
 * @param {unknown} state @param {string} path @returns {number | "open" | null}
 */
export function listMaxIn(state, path) {
  /** @type {any} */
  let t = { [TAG]: "struct", fields: state };
  for (const k of path.split(".")) {
    const fields = t && typeof t === "object" && t[TAG] === "struct" ? t.fields : null;
    if (!fields || typeof fields !== "object" || !Object.hasOwn(fields, k)) return null;
    t = fields[k];
  }
  if (!t || typeof t !== "object" || t[TAG] !== "list") return null;
  return typeof t.max === "number" ? t.max : "open";
}

/**
 * A Draw output: its builder read into a declaration, or null (each problem added).
 * @param {Record<string, any>} def @param {Record<string, any>} p @param {{ frame: string }} seam
 * @param {{ dims: number } | undefined} frame  the seam's frame, as the Dialect declares it
 * @param {Array<string | number>} at @param {string} what @param {Add} add
 */
export function drawOutput(def, p, seam, frame, at, what, add) {
  if (frame && frame.dims !== 2) { add("J001", [...at, "seam"], `${what}: a draw list is measured in a 2-D frame, and '${seam.frame}' has ${frame.dims} dims`, "name a frame with dims: 2"); return null; }
  const inputsName = typeof def.inputs?.name === "string" ? def.inputs.name : null;
  const r = declareDraw(p, { listMax: (path) => listMaxIn(def.state, path), inputsName });
  for (const d of r.problems) add(d.code, at, `${what}: ${d.message}`, d.code === "J002" ? "use each, a pen, or spread" : "see kit/draw/README.md, Building a draw list");
  return r.decl;
}

/**
 * Judges a Draw input: it takes no default (unwired, it is an empty list), no required, no delivery, no record.
 * @param {Record<string, any>} p @param {{ frame: string }} seam @param {{ dims: number } | undefined} frame
 * @param {Array<string | number>} at @param {string} what @param {Add} add
 */
export function drawInput(p, seam, frame, at, what, add) {
  if (frame && frame.dims !== 2) add("J001", [...at, "seam"], `${what}: a draw list is measured in a 2-D frame, and '${seam.frame}' has ${frame.dims} dims`, "name a frame with dims: 2");
  const extra = ["default", "required", "delivery", "record", "type"].filter((k) => p[k] !== undefined);
  if (extra.length) add("J001", [...at, extra[0]], `${what}: a Draw input takes no default or required: unwired, it is an empty list; nor a delivery, record or type (it is read whole, as the inputs global's ${"`<inputs>.<port>`"})`, `remove ${extra.join(", ")}`);
}

/**
 * A Dialect's colors and images, judged (J003).
 * @param {Record<string, any>} def @param {Add} add
 * @returns {{ colors: Record<string, string>, images: Record<string, { size: number[], cell?: number[], note?: string }> }}
 */
export function declarePaint(def, add) {
  const problems = checkPaint({ colors: def.colors, images: def.images });
  for (const m of problems) add("J003", [m.startsWith("images") ? "images" : "colors"], m, 'colors: { <name>: "#rrggbb" }, images: { <name>: { size: [<w>, <h>], cell?: [<cw>, <ch>], note } }');
  if (problems.length) return { colors: {}, images: {} };
  return { colors: { ...(def.colors ?? {}) }, images: { ...(def.images ?? {}) } };
}

/**
 * Each Draw output's max for one built Program (ruling 1), or a J010 diagnostic for the port.
 * @param {any} dialect @param {Record<string, any>} record @param {(d: { code: string, severity: "error", message: string, tip: string, port: string }) => void} push
 * @returns {Record<string, { max: number }>}
 */
export function drawMaxes(dialect, record, push) {
  /** @type {Record<string, { max: number }>} */
  const out = {};
  for (const p of Object.values(/** @type {Record<string, any>} */ (dialect.seams.out))) {
    if (!p.draw) continue;
    const r = drawMax(p.draw, /** @type {Seam & { max: number }} */ (p.seam).max, record);
    if (r.ok) out[p.name] = { max: r.max };
    else push({ code: "J010", severity: "error", message: `the ${dialect.name} Dialect's output '${p.name}': ${r.error}`, tip: `max: (record) => <n>, at most ${/** @type {any} */ (p.seam).max}`, port: p.name });
  }
  return out;
}
