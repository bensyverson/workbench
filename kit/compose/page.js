// The page: a built-in part whose Event outputs are the declared Controls of the composed parts' UIs (Ben's ruling 5,
// 2026-11-26; declared Controls, 2026-11-27). The kit knows no Control of its own: `page.out.<control>` is an open
// handle at glue time, judged when the composition is checked against the UIs of the packages it is given (S111), and
// a wire from it is checked as any wire. It needs no `.part(page)`, since a wire from it adds it. The page has no
// step: kit/run delivers a page input in the log (a `control` input addressed to the part "page") to every wire from
// that Control at the input's own stamp. For queue sizing (S116) it counts as a frame part that sends each Control's
// `perFrame` records a display frame (`pageRuntimeFor`).

import { defineDialect, defineGrammar, exact, name } from "../define/index.js";
import { programOf } from "../define/grammar.js";
import { isHandle } from "../define/handles.js";
import { isUI } from "../define/ui.js";
import { parseSeam } from "../seam/index.js";
import { keyCodesOf } from "../define/ui/controls.js";

/** The page part's name and its Dialect's. */
export const PAGE = "page";

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
  ports: { out: {}, in: {} },
}));
const pageGrammar = defineGrammar(pageDialect, { root: PAGE, constructs: { [PAGE]: { opens: [name()], slots: {} } } });

/** The page, as a glue names it: `page.out.<control>`. */
export const page = /** @type {any} */ (pageGrammar(PAGE));
const pageProgram = programOf(page);

/** Whether a handle is one of the page's. @param {unknown} h */
export const isPageHandle = (h) => isHandle(h) && h.program === pageProgram;

/**
 * One Control as the composed page records it: what kit/run checks a page input against (its seam), how its records
 * fold (state) or carry over (delta), and what a host builds its forms and key maps from (its declaration, with no
 * functions, so the record stays data).
 * @typedef {{ kind: string, seam: string, records: "state" | "delta", perFrame: number, latency?: string, keyed?: true, decl: Record<string, any> }} PageControl
 */

/** A declaration as plain data: its functions (an `each`) left out. @param {unknown} decl */
const dataOf = (decl) => JSON.parse(JSON.stringify(decl, (_k, v) => (typeof v === "function" ? undefined : v)));

/**
 * The page's runtime, for queue sizing only (kit/run never steps the page): a frame part that sends each Control's
 * perFrame records a display frame.
 * @param {Record<string, { perFrame: number }>} controls
 */
export const pageRuntimeFor = (controls) => /** @type {any} */ ({
  dialect: { name: PAGE },
  clock: () => ({ frame: true }),
  events: { out: Object.fromEntries(Object.entries(controls).map(([n, c]) => [n, c.perFrame])), in: {} },
});

/**
 * A part's UI among the packages a composition was given: one whose UI is of the part's Dialect (by value, else by
 * name). A package entry is kit/package's loadPackage result, or anything with a `ui` (a test's `{ name, ui }`).
 * @param {any[] | undefined} packages @param {any} dialect
 */
export function uiFor(packages, dialect) {
  for (const p of packages ?? []) {
    const ui = isUI(p) ? p : p?.ui;
    if (!isUI(ui)) continue;
    if (ui.dialect === dialect || p.dialect === dialect || ui.package === dialect.name) return ui;
  }
  return null;
}

/**
 * The page's Controls from the composed parts' UIs: each Control with an Event input, by name, with the parts that
 * declare it. Two parts' Controls of one name are one Control only when both declarations are equal data with no
 * `each` and no `to`; any other pair is a clash (S119). Keys two different Controls bind are S121's.
 * @param {Array<{ name: string, dialectName: string, ui: any }>} parts  the parts with a UI, in composition order
 */
export function pageControls(parts) {
  /** @type {Record<string, PageControl & { parts: Array<{ part: string, input: string }> }>} */
  const controls = {};
  /** The Controls a second part may share: declared with no each and no to. */
  const shareable = new Set();
  /** @type {Array<{ name: string, first: { part: string, dialect: string, decl: unknown }, second: { part: string, dialect: string, decl: unknown } }>} */
  const clashes = [];
  /** @type {Map<string, { part: string, dialect: string, decl: unknown }>} */
  const firstBy = new Map();
  for (const p of parts) {
    for (const [n, c] of Object.entries(/** @type {Record<string, any>} */ (p.ui.controls ?? {}))) {
      if (c.local) continue;
      const decl = dataOf(c.decl);
      const shared = c.decl.each === undefined && c.decl.to === undefined;
      const had = controls[n];
      if (had) {
        const first = /** @type {{ part: string, dialect: string, decl: unknown }} */ (firstBy.get(n));
        if (!shared || !shareable.has(n) || JSON.stringify(canonical(decl)) !== JSON.stringify(canonical(had.decl))) { clashes.push({ name: n, first, second: { part: p.name, dialect: p.dialectName, decl } }); continue; }
        had.parts.push({ part: p.name, input: n });
        continue;
      }
      firstBy.set(n, { part: p.name, dialect: p.dialectName, decl });
      controls[n] = /** @type {any} */ ({ kind: c.kind, seam: c.seam, records: c.records, perFrame: c.perFrame, ...(c.latency ? { latency: c.latency } : {}), ...(c.keyed ? { keyed: true } : {}), decl, parts: [{ part: p.name, input: n }] });
      if (shared) shareable.add(n);
    }
  }
  /** @type {Array<{ code: string, controls: string[] }>} */
  const sharedKeys = [];
  /** @type {Map<string, string>} */
  const byCode = new Map();
  for (const [n, c] of Object.entries(controls)) {
    for (const { code } of keyCodesOf(c.decl)) {
      const owner = byCode.get(code);
      if (owner === undefined) byCode.set(code, n);
      else if (owner !== n && !sharedKeys.some((s) => s.code === code && s.controls.includes(n))) sharedKeys.push({ code, controls: [owner, n] });
    }
  }
  return { controls, clashes, sharedKeys };
}

/** A value with its object keys sorted, for a canonical comparison. @param {unknown} v @returns {unknown} */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(/** @type {any} */ (v)[k])]));
  return v;
}

/**
 * The page's output seams, as a Dialect's are held: one Event output per Control.
 * @param {Record<string, PageControl>} controls
 */
export function pageSeams(controls) {
  return Object.fromEntries(Object.entries(controls).map(([n, c]) => [n, { name: n, seam: /** @type {any} */ (parseSeam(c.seam)).type, seamText: c.seam, note: `the Control '${n}' (${c.kind})` }]));
}

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
