// The input log: every outside event of a run, stamped with the workbench time T it applies at (at the first instant
// at or after it). A D-pad's state (`control`), a param change (`param`), a rebuild with its new record (`rebuild`),
// and each display frame the real-time driver ran (`frame`, with `capped` when the frame was longer than the
// catch-up cap). A run is a pure function of the composed record, the params and this log.

import { q, qText, sub, toNumber } from "../define/rational.js";

/** @import { Q } from "../define/rational.js" */

/** The first millisecond after `t`: the driver keeps its frame stamps, and an input's default stamp, to the millisecond. @param {Q} t */
export const afterMs = (t) => q(Math.floor((t.n * 1000) / t.d) + 1, 1000);

/** The kinds of input. */
export const INPUT_KINDS = Object.freeze(["control", "param", "rebuild", "frame"]);

/**
 * One input as the scheduler holds it (T a rational; the log prints it as text).
 * @typedef {{ kind: "control" | "param" | "rebuild" | "frame", T: Q, part?: string, name?: string, value?: unknown, record?: Record<string, any>, trigger?: any, package?: { content?: string | null }, capped?: { wall: number, kept: number } }} Entry
 */

/**
 * An input as given (T in seconds, a rational or its text), checked and stamped.
 * @param {Record<string, any>} e @param {(t: any) => Q} toQ @returns {Entry}
 */
export function inputEntry(e, toQ) {
  if (!e || typeof e !== "object" || !INPUT_KINDS.includes(e.kind)) throw new Error(`an input is { kind, T, … } with kind ${INPUT_KINDS.join(", ")}, not ${JSON.stringify(e)}`);
  if (e.T === undefined || e.T === null) throw new Error(`an input needs its stamp T: ${JSON.stringify(e)}`);
  const T = toQ(e.T);
  if (T.n < 0) throw new Error(`an input's stamp is at least 0, not ${qText(T)}`);
  if (e.kind !== "frame" && typeof e.part !== "string") throw new Error(`a ${e.kind} input names its part: ${JSON.stringify(e)}`);
  if ((e.kind === "control" || e.kind === "param") && typeof e.name !== "string") throw new Error(`a ${e.kind} input names what it sets: ${JSON.stringify(e)}`);
  if (e.kind === "rebuild" && (e.record === null || typeof e.record !== "object")) throw new Error("a rebuild input carries the part's new built record");
  return /** @type {Entry} */ ({ ...e, T });
}

/** @param {number} x */
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * The runs of capped frames in a log: each span's first and last frame, the wall time it took, the workbench time it
 * covered, and the ratio (N001: "ran at 0.13× for 2 s").
 * @param {Entry[]} entries @returns {Array<{ from: string, to: string, wall: number, workbench: number, ratio: number }>}
 */
export function slowdowns(entries) {
  /** @type {Array<{ from: string, to: string, wall: number, workbench: number, ratio: number }>} */
  const out = [];
  /** @type {Q | null} */
  let prev = null;
  /** @type {{ from: Q, to: Q, wall: number } | null} */
  let span = null;
  const close = () => {
    if (!span) return;
    const work = toNumber(sub(span.to, span.from));
    out.push({ from: qText(span.from), to: qText(span.to), wall: r3(span.wall), workbench: r3(work), ratio: r3(work / span.wall) });
    span = null;
  };
  for (const e of entries) {
    if (e.kind !== "frame") continue;
    if (e.capped) {
      if (!span) span = { from: prev ?? { n: 0, d: 1 }, to: e.T, wall: 0 };
      span.to = e.T;
      span.wall += e.capped.wall;
    } else close();
    prev = e.T;
  }
  close();
  return out;
}
