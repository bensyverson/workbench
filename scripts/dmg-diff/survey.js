// The lowering survey: every runtime lambda of every DMG preset, lowered by the M1
// pipeline, and each rejection put in one class, so the H1 report can tell the
// subset's rejections from gaps in lowering and from top-level helpers.

import { lowerPreset } from "../dmg-lower/pipeline.js";
import { topLevelNames, topLevelRefs } from "../dmg-oracle/toplevel.js";

/** @import { loadDmg } from "../dmg-oracle/load.js" */

/**
 * Why a lambda did not lower, in the order the classes are checked.
 * - `helpers`: it uses a top-level helper or constant of its preset, which no runtime lambda can see.
 * - `subset`: the parser's subset check, or lowering, rejects a construct the subset excludes on purpose.
 * - `not-yet`: lowering or the DMG dialect does not handle it yet, though the subset allows it.
 */
export const REJECTION = /** @type {const} */ (["helpers", "subset", "not-yet"]);

/** @typedef {"lowered" | typeof REJECTION[number]} Status */

/**
 * Lowering codes that mean "not handled yet": L012 says so; L002 here is a member the
 * dialect does not describe (string methods, w.bg); L015 on a query is reduce without
 * an initial value. Every other code is the subset (or the program) at fault.
 */
const NOT_YET = new Set(["L012", "L002"]);

/**
 * @typedef {object} SurveyRow
 * @property {string} preset
 * @property {string} id
 * @property {string} kind
 * @property {Status} status
 * @property {string[]} codes   Distinct error codes, in source order.
 * @property {string[]} messages  One per error: `code message | source text`.
 * @property {string[]} topLevelRefs
 */

/**
 * Classifies a rejected lambda from its error diagnostics and top-level references.
 * @param {Array<{ code: string, message: string }>} errors
 * @param {string[]} refs
 * @returns {Status}
 */
export function classify(errors, refs) {
  if (errors.length === 0) return "lowered";
  if (refs.length > 0) return "helpers";
  const notYet = (/** @type {{ code: string, message: string }} */ d) => NOT_YET.has(d.code) || (d.code === "L015" && /^(filter|find|some|every|reduce) got/.test(d.message));
  return errors.every(notYet) ? "not-yet" : "subset";
}

/**
 * Lowers every preset and returns one row per runtime lambda (a fragment lambda once, failing if any part fails).
 * @param {ReturnType<typeof loadDmg>} dmg
 * @returns {SurveyRow[]}
 */
export function survey(dmg) {
  return dmg.presets.flatMap((p) => {
    const names = topLevelNames(p.code);
    const { entries } = lowerPreset(dmg, p.id);
    /** @type {Map<string, typeof entries>} */
    const bySlot = new Map();
    for (const e of entries) bySlot.set(e.slot.id, [...(bySlot.get(e.slot.id) ?? []), e]);
    return [...bySlot.values()].map((group) => {
      const slot = group[0].slot;
      const errors = group.flatMap((e) => e.result.diagnostics.filter((d) => d.severity === "error")
        .map((d) => ({ code: d.code, message: d.message, text: slot.src.slice(d.range[0], d.range[1]).replace(/\s+/g, " ").slice(0, 60) })));
      const refs = topLevelRefs(slot.src, names);
      return {
        preset: p.id, id: slot.id, kind: slot.kind,
        status: classify(errors, refs),
        codes: [...new Set(errors.map((d) => d.code))],
        messages: [...new Set(errors.map((d) => `${d.code} ${d.message} | ${d.text}`))],
        topLevelRefs: refs,
      };
    });
  });
}

/**
 * Per-preset counts: lowered, each rejection class, and the codes seen. A preset with no runtime lambdas gets a row of zeros.
 * @param {SurveyRow[]} rows
 * @param {string[]} presets  Every preset id, in order.
 */
export function tally(rows, presets) {
  /** @type {Map<string, { preset: string, total: number, lowered: number, helpers: number, subset: number, "not-yet": number, codes: Record<string, number> }>} */
  const out = new Map(presets.map((p) => [p, { preset: p, total: 0, lowered: 0, helpers: 0, subset: 0, "not-yet": 0, codes: {} }]));
  for (const r of rows) {
    const t = out.get(r.preset) ?? { preset: r.preset, total: 0, lowered: 0, helpers: 0, subset: 0, "not-yet": 0, codes: {} };
    t.total++;
    t[r.status]++;
    for (const c of r.codes) t.codes[c] = (t.codes[c] ?? 0) + 1;
    out.set(r.preset, t);
  }
  return [...out.values()];
}
