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
 * functions, so the record stays data). A scoped Control (keyed, or with `to`) names the part that owns it and its
 * declared name there (`part`, `control`); its page name is `<part>.<control>`.
 * @typedef {{ kind: string, seam: string, records: "state" | "delta", perFrame: number, latency?: string, keyed?: true, part?: string, control?: string, decl: Record<string, any> }} PageControl
 */

/**
 * The page Control a glue's `page.out.<name>` names when it feeds `consumer`: the consumer's own scoped Control of
 * that name when it declares one (its own wins over a shared Control of the name, which then reaches only the parts
 * that share it), else the name itself (a shared Control, or a scoped one spelled out as `page.out["<part>.<control>"]`),
 * else null.
 * @param {Record<string, PageControl>} controls @param {string} name @param {string | null} consumer  the part the wire feeds
 */
export function pageControlFor(controls, name, consumer) {
  if (consumer !== null) {
    const own = scopedName(consumer, name);
    if (Object.hasOwn(controls, own) && controls[own].control === name) return own;
  }
  return Object.hasOwn(controls, name) ? name : null;
}

/** The scoped Controls declared under one name, by page name. @param {Record<string, PageControl>} controls @param {string} name */
export const scopedOf = (controls, name) => Object.keys(controls).filter((k) => controls[k].control === name);

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
 * Whether a declared Control belongs to its part (Ben's ruling of 2026-11-27, leaf ZNpW0f): a keyed one (`each`),
 * whose instances come from its own part's record, and one with `to`, whose target is an address in its own part's
 * Program. Either one means something only for the part that declares it, so two instances of one package each keep
 * theirs. Any other Control is shared by name across the composition.
 * @param {{ each?: unknown, to?: unknown }} decl
 */
export const isScoped = (decl) => decl.each !== undefined || decl.to !== undefined;

/** A part's own Control's name on the page: `<part>.<control>`, as a part's image is `<part>.<image>`. @param {string} part @param {string} control */
export const scopedName = (part, control) => `${part}.${control}`;

/**
 * The page's Controls from the composed parts' UIs: each Control with an Event input, with the parts that declare it.
 * A scoped Control (`isScoped`) is its part's alone, named `<part>.<control>`, and never clashes. A shared one is
 * named by its declared name, and two parts' shared Controls of one name are one Control only when both declarations
 * are equal data; any other pair is a clash (S119). Keys two different Controls bind are S121's.
 * @param {Array<{ name: string, dialectName: string, ui: any }>} parts  the parts with a UI, in composition order
 */
export function pageControls(parts) {
  /** @type {Record<string, PageControl & { parts: Array<{ part: string, input: string }> }>} */
  const controls = {};
  /** @type {Array<{ name: string, first: { part: string, dialect: string, decl: unknown }, second: { part: string, dialect: string, decl: unknown } }>} */
  const clashes = [];
  /** @type {Map<string, { part: string, dialect: string, decl: unknown }>} */
  const firstBy = new Map();
  for (const p of parts) {
    for (const [n, c] of Object.entries(/** @type {Record<string, any>} */ (p.ui.controls ?? {}))) {
      if (c.local) continue;
      const decl = dataOf(c.decl);
      const scoped = isScoped(c.decl);
      const key = scoped ? scopedName(p.name, n) : n;
      const had = controls[key];
      if (had) {
        const first = /** @type {{ part: string, dialect: string, decl: unknown }} */ (firstBy.get(key));
        if (JSON.stringify(canonical(decl)) !== JSON.stringify(canonical(had.decl))) { clashes.push({ name: n, first, second: { part: p.name, dialect: p.dialectName, decl } }); continue; }
        had.parts.push({ part: p.name, input: n });
        continue;
      }
      firstBy.set(key, { part: p.name, dialect: p.dialectName, decl });
      controls[key] = /** @type {any} */ ({ kind: c.kind, seam: c.seam, records: c.records, perFrame: c.perFrame, ...(c.latency ? { latency: c.latency } : {}), ...(c.keyed ? { keyed: true } : {}), ...(scoped ? { part: p.name, control: n } : {}), decl, parts: [{ part: p.name, input: n }] });
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
