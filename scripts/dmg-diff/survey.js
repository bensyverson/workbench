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
 * - `not-yet`: lowering or the DMG dialect does not handle it yet, though the subset allows it (see `isNotYet`).
 */
export const REJECTION = /** @type {const} */ (["helpers", "subset", "not-yet"]);

/** @typedef {"lowered" | typeof REJECTION[number]} Status */

/**
 * What a diagnostic's source text names, for L002: the property whose lookup failed.
 * @typedef {(name: string) => boolean} HostHas
 */

/**
 * Whether the dialect's gap is real: L012 says "not lowered yet"; L002 is a member
 * the dialect does not describe, which is a gap only when the host has it (a member of
 * the world, a string method, an array method) and a typo otherwise; L015 is a gap only
 * for `reduce` without an initial value. Every other code is the subset (or the program) at fault.
 * @param {{ code: string, message: string, text?: string }} d
 * @param {HostHas} hostHas
 */
const isNotYet = (d, hostHas) =>
  d.code === "L012" ||
  (d.code === "L002" && hostHas(d.text ?? "")) ||
  (d.code === "L015" && /^reduce got/.test(d.message));

/**
 * Every member name the DMG host offers lambdas: the keys of the world object the runtime
 * hands them (plus `world`), and the members of String and Array.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @returns {HostHas}
 */
export function hostMembers(dmg) {
  const w = dmg.build(dmg.presets[0].id).runtime({ seed: 1 }).w;
  const names = new Set([...Object.keys(w), "world", ...Object.getOwnPropertyNames(String.prototype), ...Object.getOwnPropertyNames(Array.prototype)]);
  return (name) => names.has(name);
}

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
 * Pure: what the host has comes in as `hostHas`.
 * @param {Array<{ code: string, message: string, text?: string }>} errors  `text` is the diagnostic's source text.
 * @param {string[]} refs
 * @param {HostHas} hostHas
 * @returns {Status}
 */
export function classify(errors, refs, hostHas) {
  if (errors.length === 0) return "lowered";
  if (refs.length > 0) return "helpers";
  return errors.every((d) => isNotYet(d, hostHas)) ? "not-yet" : "subset";
}

/**
 * Lowers every preset and returns one row per runtime lambda (a fragment lambda once, failing if any part fails).
 * @param {ReturnType<typeof loadDmg>} dmg
 * @returns {SurveyRow[]}
 */
export function survey(dmg) {
  const hostHas = hostMembers(dmg);
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
        status: classify(errors, refs, hostHas),
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
