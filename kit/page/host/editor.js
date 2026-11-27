// The editor stage's model (project/2026-11-27-controls-draft.md, requirements 8 and 9; the generated view `editor`):
// the Program's text (the glue, or a preset's example) and its history (kit/page's createHistory). A release (a Grip,
// a Control with `to`, a custom element's commit), an action's edits and an applied edit are each one step: written
// with kit/page's writeBack, then built and put in force by the host's rebuild. A refused write is a listed diagnostic,
// never silent, and keeps nothing: H011 (the argument is not a literal), H012 (the text changed since the record was
// built, or the edited text does not build). An undo builds the previous text: an edit, not a rewind. Writes run one
// at a time, each on the text the one before it left. No DOM: main.js draws the textarea over a <pre>.

import { createHistory, writeBack, writeBackAll } from "../index.js";

/** H011 is a warning (the Grip or Control is drawn disabled); every other refusal is an error. */
const WARNING_CODES = new Set(["H011"]);

/** @typedef {{ code: string, severity: "error" | "warning", message: string, fix?: string }} EditorDiagnostic */
/** @typedef {{ ok: true, text: string, changed: boolean } | { ok: false, diagnostics: EditorDiagnostic[] }} Outcome */
/** @typedef {{ ok: true } | { ok: false, diagnostics: EditorDiagnostic[] }} Built */
/** A commit to write back: a part's target and its value (`step`: the number is printed to it). @typedef {{ part: string, to: string, value: unknown, step?: number }} Commit */

/**
 * @param {{ code: string, message: string, fix?: string }} d @returns {EditorDiagnostic}
 */
const diagnostic = (d) => ({ code: d.code, severity: WARNING_CODES.has(d.code) ? "warning" : "error", message: d.message, ...(d.fix ? { fix: d.fix } : {}) });

/**
 * @param {{ text: string, recordOf: (part: string) => Record<string, any>, rebuild: (text: string) => Promise<Built>, inForce?: () => boolean }} o
 *   `text` the Program's text as loaded; `recordOf(part)` the record in force for a part, which the text was built
 *   from; `rebuild(text)` builds a text and puts it in force (rebuildWith below), or says why it did not build;
 *   `inForce()` whether the record in force was built from the text (the session's `textInForce`), so an Apply of the
 *   unchanged text puts it in force again when it is not
 */
export function createEditor(o) {
  const history = createHistory(o.text);
  /** The writes in turn: each starts when the one before it ends. @type {Promise<unknown>} */
  let queue = Promise.resolve();
  let busy = 0;
  /** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  const inTurn = (job) => {
    busy += 1;
    const next = queue.then(job).finally(() => { busy -= 1; });
    queue = next.catch(() => {});
    return next;
  };
  /** @param {string} text @returns {Outcome} */
  const same = (text) => ({ ok: true, text, changed: false });

  /**
   * A text that some write made: built, then kept as one step, or refused as H012 when it does not build.
   * @param {string} text @param {string} what @returns {Promise<Outcome>}
   */
  async function keep(text, what) {
    if (text === history.text) return same(text);
    const built = await o.rebuild(text);
    if (!built.ok) {
      const why = built.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ");
      return { ok: false, diagnostics: [{ code: "H012", severity: "error", message: `${what}: the edited text does not build, so nothing is kept and the text is unchanged: ${why}`, fix: "write a value the Program accepts" }] };
    }
    history.commit(text);
    return { ok: true, text, changed: true };
  }

  return {
    /** The text in force. */
    get text() { return history.text; },
    get canUndo() { return history.canUndo; },
    get canRedo() { return history.canRedo; },
    /** Whether a write is in flight. */
    get busy() { return busy > 0; },
    /** A release's value written back: one step. @param {Commit} c @returns {Promise<Outcome>} */
    write: (c) => inTurn(async () => {
      const r = writeBack(history.text, o.recordOf(c.part), c.to, c.value, c.step ? { step: c.step } : {});
      if (!r.ok) return { ok: false, diagnostics: [diagnostic(r)] };
      return keep(r.text, `the write-back of ${c.to} = ${JSON.stringify(c.value)}`);
    }),
    /** An action's edits, written as one edit of the text: one step. @param {string} part @param {Array<{ to: string, value: unknown, step?: number }>} edits @returns {Promise<Outcome>} */
    writeAll: (part, edits) => inTurn(async () => {
      const r = writeBackAll(history.text, o.recordOf(part), edits);
      if (!r.ok) return { ok: false, diagnostics: [diagnostic(r)] };
      return keep(r.text, `the edits of ${edits.map((e) => e.to).join(", ")}`);
    }),
    /**
     * The person's text, built: one step; a text that does not build is its build's own diagnostics, and the history
     * is unchanged. The unchanged text is no step: it is built and put in force again only when the record in force
     * is not its own (`inForce`). @param {string} draft @returns {Promise<Outcome>}
     */
    apply: (draft) => inTurn(async () => {
      if (draft === history.text) {
        if (o.inForce?.() ?? true) return same(draft);
        const built = await o.rebuild(draft);
        return built.ok ? same(draft) : { ok: false, diagnostics: built.diagnostics };
      }
      const built = await o.rebuild(draft);
      if (!built.ok) return { ok: false, diagnostics: built.diagnostics };
      history.commit(draft);
      return { ok: true, text: draft, changed: true };
    }),
    /** The previous text, built and put in force. @returns {Promise<Outcome>} */
    undo: () => inTurn(() => move(history.undo, history.redo)),
    /** The next text, built and put in force. @returns {Promise<Outcome>} */
    redo: () => inTurn(() => move(history.redo, history.undo)),
  };

  /**
   * Steps the history one way and builds the text there; a text that no longer builds steps back (H012).
   * @param {() => string | null} go @param {() => string | null} back @returns {Promise<Outcome>}
   */
  async function move(go, back) {
    const was = history.text;
    const text = go();
    if (text === null) return same(was);
    const built = await o.rebuild(text);
    if (built.ok) return { ok: true, text, changed: true };
    back();
    const why = built.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ");
    return { ok: false, diagnostics: [{ code: "H012", severity: "error", message: `that text no longer builds, so the history stays where it was: ${why}`, fix: "edit the text and Apply it" }] };
  }
}

/** The one span two texts differ in: `a`'s `start..end`, which `b` has as `text`. @param {string} a @param {string} b */
function changeOf(a, b) {
  let start = 0;
  const n = Math.min(a.length, b.length);
  while (start < n && a[start] === b[start]) start++;
  let ea = a.length, eb = b.length;
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { start, end: ea, text: b.slice(start, eb) };
}

/**
 * A draft rebased onto a written text: both were made from `base`, and when the draft's change and the write's do not
 * meet (each is the one span its text differs from `base` in; spans that overlap or touch meet), the written text with
 * the draft's change, else `{ ok: false }`, and the panel keeps the draft and says the text changed under it.
 * @param {string} base @param {string} draft @param {string} written @returns {{ ok: true, text: string } | { ok: false }}
 */
export function rebaseDraft(base, draft, written) {
  if (draft === base) return { ok: true, text: written };
  if (written === base) return { ok: true, text: draft };
  const d = changeOf(base, draft), w = changeOf(base, written);
  if (d.start <= w.end && w.start <= d.end) return { ok: false };
  const [first, second] = d.start < w.start ? [d, w] : [w, d];
  return { ok: true, text: base.slice(0, first.start) + first.text + base.slice(first.end, second.start) + second.text + base.slice(second.end) };
}

/**
 * The host's rebuild for an editor: the text built on the packages already loaded (load.js's `reloadText`), then put
 * in force on the running session (`session.install`: each part's rebuild logged), or, when the composition's parts or
 * wires changed, as a new run (`remount`, told why). A text that does not build is its error diagnostics.
 * @param {{ reload: (text: string) => Promise<import("./load.js").Loaded>, current: () => { session: { install: (next: import("./load.js").Loaded) => { ok: true } | { ok: false, reload: true, why: string } } | null }, remount: (next: import("./load.js").Loaded, why: string) => unknown }} o
 * @returns {(text: string) => Promise<Built>}
 */
export function rebuildWith(o) {
  return async (text) => {
    const next = await o.reload(text);
    if (!next.composed) {
      const errors = next.diagnostics.filter((d) => d.severity === "error");
      return { ok: false, diagnostics: (errors.length ? errors : [{ code: "LOAD", severity: /** @type {const} */ ("error"), message: "the text did not build" }]).map((/** @type {any} */ d) => ({ code: d.code, severity: d.severity, message: d.message, ...(d.fix ? { fix: d.fix } : {}) })) };
    }
    const session = o.current().session;
    const r = session ? session.install(next) : { ok: false, reload: true, why: "nothing is running" };
    if (!r.ok) await o.remount(next, r.why);
    return { ok: true };
  };
}
