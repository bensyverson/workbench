// The page: a built-in part whose Event outputs are the controls (Ben's ruling 5, 2026-11-26). A glue wires one like
// any port, `.wire(page.out.<control>, <part>.in.<input>)`, with the usual seam, rename and S checks; it needs no
// `.part(page)`, since a wire from it adds it. The page has no step: kit/run delivers a page input in the log (a
// `control` input addressed to the part "page") to every wire from that control at the input's own stamp. For queue
// sizing (S116) it counts as a frame part that sends at most one record per control per frame.

import { defineDialect, defineGrammar, defineRuntime, exact, name } from "../define/index.js";
import { programOf } from "../define/grammar.js";
import { isHandle } from "../define/handles.js";

/** The page part's name and its Dialect's. */
export const PAGE = "page";

/** Each control the page offers, with its record: the DMG host's D-pad and buttons, each true while held. */
export const PAGE_CONTROLS = Object.freeze({
  pad: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
  a: "Event<{ held: bool }>",
  b: "Event<{ held: bool }>",
  start: "Event<{ held: bool }>",
  select: "Event<{ held: bool }>",
});

const NOTES = /** @type {Record<string, string>} */ ({
  pad: "the D-pad: one record each time the person's held directions change, each field true while that direction is held",
  a: "the A button: one record when it is pressed (held: true) and one when it is released (held: false)",
  b: "the B button: one record when it is pressed (held: true) and one when it is released (held: false)",
  start: "the Start button: one record when it is pressed (held: true) and one when it is released (held: false)",
  select: "the Select button: one record when it is pressed (held: true) and one when it is released (held: false)",
});

const pageDialect = defineDialect(/** @type {any} */ ({
  name: PAGE, numberType: "f64", text: () => "",
  types: {}, spaces: { none: { pure: true } },
  objects: { Params: { label: "the params ($)", members: {} } },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { none: { params: [], returns: "f64", space: "none" } },
  params: { object: "Params", name: "$" },
  state: { none: "f64" },
  frames: {},
  ports: { out: Object.fromEntries(Object.entries(PAGE_CONTROLS).map(([n, seam]) => [n, { seam, note: NOTES[n] }])), in: {} },
}));
const pageGrammar = defineGrammar(pageDialect, { root: PAGE, constructs: { [PAGE]: { opens: [name()], slots: {} } } });

/** The page, as a glue names it: `page.out.<control>`. */
export const page = /** @type {any} */ (pageGrammar(PAGE));
const pageProgram = programOf(page);

/** The page's runtime, for queue sizing only: kit/run never steps it. */
export const pageRuntime = defineRuntime(/** @type {any} */ (pageGrammar), {
  clock: () => ({ frame: true }),
  init: () => ({ none: 0 }),
  step: (/** @type {any} */ s) => s,
  events: { out: Object.fromEntries(Object.keys(PAGE_CONTROLS).map((n) => [n, 1])) },
});

/** Whether a handle is one of the page's. @param {unknown} h */
export const isPageHandle = (h) => isHandle(h) && h.program === pageProgram;

/**
 * The glue's calls with the page added as a part first when a wire names it and no `.part` call does.
 * @template {{ kind: string, at: any }} C
 * @param {C[]} calls @param {C["at"]} at  where the composition starts
 * @returns {C[]}
 */
export function withPage(calls, at) {
  const added = calls.some((c) => c.kind === "part" && programOf(/** @type {any} */ (c).value) === pageProgram);
  const wired = calls.some((c) => c.kind === "wire" && (isPageHandle(/** @type {any} */ (c).from) || isPageHandle(/** @type {any} */ (c).to)));
  return wired && !added ? [/** @type {C} */ (/** @type {unknown} */ ({ kind: "part", value: page, at })), ...calls] : calls;
}

/**
 * Why a page input's control or value does not fit, or null. A value is the control's record: every field, each a bool.
 * @param {string} control @param {unknown} value @returns {string | null}
 */
export function pageInputProblem(control, value) {
  const names = Object.keys(PAGE_CONTROLS);
  if (!Object.hasOwn(PAGE_CONTROLS, control)) return `the page has no control '${control}': its controls are ${names.join(", ")}`;
  const fields = control === "pad" ? ["up", "down", "left", "right"] : ["held"];
  const shape = `{ ${fields.map((f) => `${f}: bool`).join(", ")} }`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return `a page.${control} input's value is ${shape}, not ${JSON.stringify(value)}`;
  const v = /** @type {Record<string, unknown>} */ (value);
  for (const f of fields) if (typeof v[f] !== "boolean") return `a page.${control} input's value is ${shape}: ${f} is ${JSON.stringify(v[f])}, not a bool`;
  const extra = Object.keys(v).filter((k) => !fields.includes(k));
  if (extra.length) return `a page.${control} input's value is ${shape}, with no ${extra.map((k) => `'${k}'`).join(", ")}`;
  return null;
}
