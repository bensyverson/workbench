// The page's Grips, as createPage lists and drags them (project/2026-11-27-controls-draft.md, requirements 7 and 8):
// each item's Grip at its stage position, a disabled one with its H011, and a drag that previews through the page's
// preview and releases a commit. The page's own seams (its parts' UIs, the compiled records, the run's state and
// params, the shown view, the write problem, the preview) come in as functions, so this block holds no run of its own.

import { edgeInto, intoPart, fromPart } from "./pointer.js";
import { gripValue } from "./grips.js";

/** @typedef {import("./codes.js").PageDiagnostic} PageDiagnostic */
/**
 * What the Grips block takes from the page: the composed record; a part's UI and its compiled UI for the record in
 * force; the run's state and params of a part; the shown view; the composed record in force (a rebuild changes it);
 * a target's site in the record in force; why a target cannot be written; a preview of a target; the page's
 * diagnostics; and the run's T as text.
 * @typedef {{
 *   composed: any,
 *   uiOfPart: (part: string) => any,
 *   compiledOf: (part: string) => any,
 *   state: (part: string) => unknown,
 *   params: (part: string) => Record<string, any>,
 *   view: () => any,
 *   composedNow: () => any,
 *   siteOf: (part: string, to: string) => Record<string, any> | null,
 *   writeProblem: (part: string, to: string) => { code: string, message: string } | null,
 *   preview: (part: string, to: string, value: unknown, what: string) => boolean,
 *   report: (d: PageDiagnostic) => void,
 *   now: () => string,
 * }} GripSeams
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/** @param {GripSeams} seams */
export function createGripDesk(seams) {
  const { composed, uiOfPart, compiledOf, state: stateOf, params: paramsOf, view, composedNow, siteOf, writeProblem, preview, report, now } = seams;
  /** The H011s already listed, so one is one diagnostic. */
  const said = new Set();
  /** The edge the shown frame reaches a part through. @param {string} part */
  const edgeOf = (part) => { const v = view(); return v ? edgeInto(composedNow(), v.part, part, String(uiOfPart(part)?.stage?.draw ?? "view")) : null; };
  /** Every Grip on the stage now, in the shown frame. */
  function list() {
    /** @type {Array<{ part: string, grip: string, index: number, kind: string, label?: string, at: number[], to: string, disabled: { code: string, message: string } | null, item: unknown, axis?: number[], center?: number[], decl: any }>} */
    const out = [];
    for (const cp of composed.parts) {
      if (cp.name === "page" || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      if (!ui || !Object.keys(ui.grips ?? {}).length) continue;
      const c = compiledOf(cp.name);
      const state = stateOf(cp.name);
      if (!c || state === null || state === undefined) continue;
      const params = paramsOf(cp.name);
      const edge = edgeOf(cp.name);
      for (const [name, g] of Object.entries(/** @type {Record<string, any>} */ (ui.grips))) {
        const items = typeof g.each === "string" ? /** @type {unknown[]} */ (g.each.split(".").reduce((/** @type {any} */ o, /** @type {string} */ k) => o?.[k], state) ?? []) : [null];
        items.forEach((item, index) => {
          const args = typeof g.each === "string" ? [item, state, params] : [state, params];
          /** @param {string} key */
          const at = (key) => (g[key] === undefined ? undefined : /** @type {number[]} */ (c.value(`grips.${name}.${key}`, ...args)));
          let to, where, disabled = null;
          try { to = /** @type {string} */ (c.value(`grips.${name}.to`, ...args)); where = /** @type {number[]} */ (at("at")); } catch (e) { disabled = { code: "H011", message: messageOf(e) }; }
          if (!disabled) disabled = writeProblem(cp.name, /** @type {string} */ (to));
          if (disabled) {
            const key = `${cp.name}.${name}[${index}] ${to}`;
            if (!said.has(key)) { said.add(key); report({ code: "H011", severity: "warning", message: `the Grip ${name} [${index}] of part ${cp.name} is drawn disabled: ${disabled.message}`, T: now(), part: cp.name }); }
          }
          out.push({ part: cp.name, grip: name, index, kind: g.kind, ...(g.label ? { label: g.label } : {}), at: where ? fromPart(where, edge) : [NaN, NaN], to: /** @type {string} */ (to), disabled, item, axis: at("axis"), center: at("center"), decl: g });
        });
      }
    }
    return out;
  }
  /** The drags in flight, each with its latest unflushed value. @type {Set<{ flush: () => void }>} */
  const drags = new Set();
  /** Previews what the drags in flight left waiting: the page calls it once a frame. */
  const flush = () => { for (const d of drags) d.flush(); };
  /**
   * Takes hold of a Grip at a point of the shown frame. Its moves preview through the log, at most one input a frame
   * (a param input, or a rebuild built with the argument overridden), and its release gives the commit, `{ to, value }`,
   * for the host to write back. A disabled Grip cannot be taken (its H011).
   * @param {{ part: string, grip: string, index: number }} ref @param {number[]} point
   */
  function grab(ref, point) {
    const g = list().find((x) => x.part === ref.part && x.grip === ref.grip && x.index === ref.index);
    if (!g) throw new Error(`no Grip ${ref.grip} [${ref.index}] on part ${ref.part}`);
    if (g.disabled) throw new Error(`${g.disabled.code} ${g.disabled.message}`);
    const site = siteOf(g.part, g.to);
    const param = g.to.startsWith("param.") ? g.to.slice(6) : null;
    const v0 = param !== null ? paramsOf(g.part)[param] ?? site?.value : site?.value;
    const edge = edgeOf(g.part);
    const p0 = intoPart(point, edge);
    /** @type {unknown} */
    let pending;
    /** @type {unknown} */
    let last = v0;
    const drag = {
      flush() {
        if (pending === undefined) return;
        const value = pending;
        pending = undefined;
        if (preview(g.part, g.to, value, `the Grip ${g.grip} [${g.index}]`)) last = value;
      },
    };
    drags.add(drag);
    return {
      /** @param {number[]} p @param {{ alt?: boolean }} [o] */
      move(p, o = {}) {
        pending = gripValue({ kind: /** @type {any} */ (g.kind), v0: /** @type {any} */ (v0), p0, p: intoPart(p, edge), axis: g.axis, center: g.center, unit: g.decl.unit, step: g.decl.step, min: site?.min, max: site?.max, whole: site?.whole, alt: o.alt });
      },
      release() { drag.flush(); drags.delete(drag); return { to: g.to, value: last }; },
    };
  }
  return { list, grab, flush };
}
