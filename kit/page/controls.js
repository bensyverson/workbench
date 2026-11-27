// The page's Controls, as createPage lists and plays them (project/2026-11-27-controls-draft.md, requirements 1, 2
// and 8): the wired page Controls, then each part's part-local ones, a keyed one's instances for the record in force,
// and a change from an on-screen form or a custom element, logged as a page input, previewed through its target, or
// committed for the host to write back. The page's own seams (its parts' UIs, the compiled records, the write problem,
// the preview and the log) come in as functions, so this block holds no run of its own.

import { PAGE, scopedName } from "../compose/page.js";
import { roundNumber } from "./round.js";
import { PREVIEW } from "./preview.js";

/** @typedef {import("./codes.js").PageDiagnostic} PageDiagnostic */
/**
 * What the Controls block takes from the page: the composed record; the wired page Controls (the composed page's
 * `controls` that some wire takes); a part's UI and its compiled UI for the record in force; why a target cannot be
 * written; a preview of a target (how it is logged: preview.js's PREVIEW, `CHECK` a commit checked, logging nothing); why a target cannot be checked for lack of
 * a build (optional); the page's input log;
 * its diagnostics, and taking one back; and the run's T as text.
 * @typedef {{
 *   composed: any,
 *   controls: Record<string, any>,
 *   uiOfPart: (part: string) => any,
 *   compiledOf: (part: string) => any,
 *   writeProblem: (part: string, to: string) => { code: string, message: string } | null,
 *   preview: (part: string, to: string, value: unknown, what: string, how?: import("./preview.js").PreviewMode) => boolean,
 *   buildProblem?: (to: string) => string | null,
 *   logInput: (e: Record<string, any>, event?: { timeStamp?: number }) => unknown,
 *   report: (d: PageDiagnostic) => void,
 *   retract?: (d: PageDiagnostic) => void,
 *   now: () => string,
 * }} ControlSeams
 */

/** @param {ControlSeams} seams */
export function createControls(seams) {
  const { composed, controls, uiOfPart, compiledOf, writeProblem, preview, buildProblem, logInput, report, retract = () => {}, now } = seams;
  /**
   * The H011 listed for each Control (or keyed instance) that cannot write back, so one is one diagnostic while it
   * lasts; one that can again takes its own back. @type {Map<string, { text: string, d: PageDiagnostic }>}
   */
  const said = new Map();
  /**
   * The part whose UI declares a page Control, and that UI: a scoped one's own part (keyed, or with `to`: kit/compose
   * names it `<part>.<control>`), else the first part that declares a shared one.
   * @param {string} name @param {Record<string, any>} c
   */
  const ownerOf = (name, c) => {
    if (typeof c.part === "string") { const ui = uiOfPart(c.part); return ui ? { part: c.part, ui } : null; }
    for (const cp of composed.parts) {
      if (cp.name === PAGE || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      if (ui && Object.hasOwn(ui.controls ?? {}, name)) return { part: /** @type {string} */ (cp.name), ui };
    }
    return null;
  };
  /** Why a Control's target cannot be written, reported once as H011, or null. @param {string} part @param {string} what @param {string} to */
  const controlProblem = (part, what, to) => {
    const d = writeProblem(part, to);
    const key = JSON.stringify([part, what]);
    const was = said.get(key);
    if (d) {
      const text = `the Control ${what} of part ${part} cannot write back to ${to}: ${d.message}`;
      if (was?.text !== text) {
        if (was) retract(was.d);
        /** @type {PageDiagnostic} */
        const listed = { code: "H011", severity: "warning", message: text, T: now(), part };
        said.set(key, { text, d: listed });
        report(listed);
      }
    } else if (was) { retract(was.d); said.delete(key); }
    return d ? { code: d.code, message: d.message } : null;
  };
  /**
   * The page's Controls: the wired page Controls in declaration order, then each part's part-local ones (a name that
   * is no Event input, with `to`). A Control with `to` carries its part, its target and why it cannot be written (or
   * null); a keyed one its instances for the record in force, each with its own `to`.
   * @returns {Array<Record<string, any>>}
   */
  function list() {
    /** @param {string} name  the page's name @param {Record<string, any>} c @param {{ part: string, ui: any } | null} own */
    const entry = (name, c, own) => {
      /** The name the part's UI declares it by. */
      const declared = typeof c.control === "string" ? c.control : name;
      const decl = own?.ui.controls?.[declared]?.decl ?? c.decl ?? {};
      const to = typeof decl.to === "string" ? decl.to : undefined;
      /** @type {Record<string, any>} */
      const item = { name, ...c, ...(own ? { part: own.part } : {}), ...(to && own ? { to, disabled: controlProblem(own.part, declared, to) } : {}) };
      if (c.keyed && own) {
        const instances = /** @type {Array<Record<string, any>>} */ (compiledOf(own.part)?.instances?.[declared] ?? []);
        item.instances = instances.map(({ each: _, ...i }) => ({ ...i, ...(typeof i.to === "string" ? { disabled: controlProblem(own.part, `${name} [${i.key}]`, i.to) } : {}) }));
      }
      return item;
    };
    const out = Object.entries(controls).map(([name, c]) => entry(name, c, ownerOf(name, c)));
    for (const cp of composed.parts) {
      if (cp.name === PAGE || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      for (const [name, c] of Object.entries(/** @type {Record<string, any>} */ (ui?.controls ?? {}))) {
        if (!c.local) continue;
        const { input: _, ...rest } = c;
        // a Control with `to` is its part's own, so its page name is `<part>.<control>` as a wired one's is
        out.push(entry(scopedName(cp.name, name), { ...rest, control: name }, { part: cp.name, ui }));
      }
    }
    return out;
  }
  /** A part-local Control's previews waiting for the next frame, the latest of each target. @type {Map<string, { part: string, to: string, value: unknown, what: string }>} */
  const waiting = new Map();
  /** Previews what the part-local Controls left waiting: the page calls it once a frame. */
  const flush = () => {
    const all = [...waiting.values()];
    waiting.clear();
    for (const w of all) preview(w.part, w.to, w.value, w.what);
  };
  /**
   * A Control's change from an on-screen form or a custom element (`record` is the Control's record, a keyed one's
   * with its `key`). A Control with an input logs it as a page input, stamped as a key is (`o.timeStamp`), and its
   * input carries the live value. With `to`, a `phase: "preview"` (a drag in flight) commits nothing, and a part-local
   * Control previews its target through the log, at most once a frame, as a Grip does; the release (`phase` "commit",
   * the default) gives the commit `{ part, to, value }` for the host to write back, a part-local one's preview logged
   * at once and a wired one's value checked before it is returned: a param's against its declared bounds (and by the
   * page's build, when it has one), an argument's by a build (a page with none throws, before the input is logged); a value
   * refused gives null and the page diagnostic H012. A target that cannot be written is H011: a part-local Control's change then throws, and one with an
   * input still plays and commits nothing. Throws for a Control the page lacks or an instance a keyed one lacks.
   * @param {string} name @param {Record<string, any>} record @param {{ phase?: "preview" | "commit", timeStamp?: number }} [o]
   * @returns {{ part: string, to: string, value: unknown } | null}
   */
  function control(name, record, o = {}) {
    const phase = o.phase ?? "commit";
    if (phase !== "preview" && phase !== "commit") throw new TypeError(`a Control's phase is "preview" or "commit", not ${JSON.stringify(phase)}`);
    const all = list();
    const c = all.find((x) => x.name === name);
    if (!c) throw new Error(`the page has no Control '${name}' (a page Control some wire takes, or a part-local one): its Controls are ${all.map((x) => x.name).join(", ") || "none"}`);
    let to = c.to, disabled = c.disabled ?? null, what = name;
    // a keyed Control whose UI the page cannot read has no instances to check: its input alone judges the record
    if (c.keyed && c.instances) {
      const inst = /** @type {Array<Record<string, any>>} */ (c.instances).find((i) => i.key === record?.key);
      if (!inst) throw new Error(`the Control '${name}' has no instance '${record?.key}': its keys are ${(c.instances ?? []).map((/** @type {any} */ i) => i.key).join(", ") || "none"}`);
      to = inst.to; disabled = inst.disabled ?? null; what = `${name} [${inst.key}]`;
    }
    // a commit (or a part-local change) that no build can check is a host mistake: refused before it is logged
    const missing = typeof to === "string" && !disabled && (c.local || phase === "commit") ? buildProblem?.(to) : null;
    if (missing) throw new Error(missing);
    if (!c.local) logInput({ kind: "control", part: PAGE, name, value: { ...record } }, o);
    if (typeof to !== "string") return null;
    if (disabled) { if (c.local) throw new Error(`${disabled.code} ${disabled.message}`); return null; }
    if (!record || !("value" in record)) throw new TypeError(`the Control '${name}' writes its record's value back to ${to}, and ${JSON.stringify(record)} has none`);
    const part = /** @type {string} */ (c.part), value = typeof record.value === "number" ? roundNumber(record.value, typeof c.decl?.step === "number" ? c.decl.step : undefined, { min: c.decl?.min, max: c.decl?.max }) : record.value;
    if (c.local) {
      const key = `${part} ${to}`;
      if (phase === "preview") { waiting.set(key, { part, to, value, what: `the Control ${what}` }); return null; }
      waiting.delete(key);
      if (!preview(part, to, value, `the Control ${what}`, PREVIEW.LOG)) return null;
    } else if (phase === "preview") return null;
    else if (!preview(part, to, value, `the Control ${what}`, PREVIEW.CHECK)) return null;
    return { part, to, value };
  }
  return { list, control, flush };
}
