// Actions (project/2026-11-27-controls-draft.md, requirement 11): the host imports an action's module, as it does a
// custom element's, and hands runAction the function. It is called with { record, state, params, files, signal,
// progress, pause }; `pause()` gives the thread back once a slice has run its budget, as a sweep's slices do. What it
// gives is checked: a file `{ name, type, bytes }` (bytes a Uint8Array) for the host to offer, or edits
// `[{ to, value }]` written back as one step of the text's history. A throw, or the wrong shape, is H013.

import { writeBackAll } from "./writeback.js";

/** How long a slice runs before pause yields, in ms (a sweep's budget). */
export const ACTION_BUDGET = 12;

/**
 * @typedef {object} ActionOptions
 * @property {Record<string, any>} record @property {unknown} state @property {Record<string, unknown>} params
 * @property {Record<string, unknown>} [files]  the package's decoded data files (kit/package's data)
 * @property {"file" | "edits"} gives
 * @property {ReturnType<typeof import("./history.js").createHistory>} [history]  where edits land (gives: "edits")
 * @property {AbortSignal} [signal] @property {(fraction: number) => void} [onProgress]
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Runs an action. Resolves `{ ok: true, file }` or `{ ok: true, edits, text }`, `{ ok: false, cancelled: true }` when
 * its signal aborted, or `{ ok: false, code, message }` (H013, or a write-back's H011 or H012).
 * @param {(ctx: any) => unknown} fn @param {ActionOptions} o
 */
export async function runAction(fn, o) {
  const abort = new AbortController();
  if (o.signal) { if (o.signal.aborted) abort.abort(); else o.signal.addEventListener("abort", () => abort.abort(), { once: true }); }
  let slice = Date.now();
  const pause = async () => {
    if (Date.now() - slice < ACTION_BUDGET) return;
    await new Promise((r) => setTimeout(r, 0));
    slice = Date.now();
  };
  const progress = (/** @type {number} */ f) => o.onProgress?.(f);
  /** @param {string} message */
  const bad = (message) => ({ ok: /** @type {const} */ (false), code: "H013", message });
  /** @type {unknown} */
  let got;
  try { got = await fn({ record: o.record, state: o.state, params: o.params, files: o.files ?? {}, signal: abort.signal, progress, pause }); } catch (e) {
    if (abort.signal.aborted) return { ok: false, cancelled: true };
    return bad(`the action threw: ${messageOf(e)}`);
  }
  if (abort.signal.aborted) return { ok: false, cancelled: true };
  if (o.gives === "file") {
    const f = /** @type {any} */ (got);
    if (!f || typeof f !== "object" || typeof f.name !== "string" || !(f.bytes instanceof Uint8Array) || (f.type !== undefined && typeof f.type !== "string")) return bad(`a file action gives { name, type, bytes } with bytes a Uint8Array, not ${describe(got)}`);
    return { ok: true, file: { name: f.name, type: f.type ?? "application/octet-stream", bytes: f.bytes } };
  }
  if (!Array.isArray(got) || !got.every((e) => e && typeof e === "object" && typeof e.to === "string" && /^(param|arg)\./.test(e.to) && "value" in e)) return bad(`an edits action gives [{ to: "param.<name>" | "arg.<address>", value }], not ${describe(got)}`);
  if (!o.history) return bad("an edits action needs the text's history to land in");
  const r = writeBackAll(o.history.text, o.record, /** @type {Array<{ to: string, value: unknown }>} */ (got));
  // edits that overlap are the action's mistake: it gave two values for one place
  if (!r.ok) return r.overlap ? bad(`the action's edits overlap: ${r.message}`) : r;
  o.history.commit(r.text);
  return { ok: true, edits: got, text: r.text };
}

/** A value in a few words, for a message. @param {unknown} v */
function describe(v) {
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? `${s.slice(0, 57)}...` : s; } catch { return typeof v; }
}
