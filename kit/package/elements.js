// The modules a UI names: every custom element on its stage and in its tiles carries a `module` path, which the
// package's `elements` must list, no more and no fewer.

import { diag } from "./codes.js";
import { MANIFEST_PATH } from "./manifest.js";
import { resolveRelative } from "./paths.js";

/**
 * The package paths of the modules a UI's custom elements name, sorted and without repeats. The UI value is
 * plain frozen data apart from its lambdas, so this walks it for objects that carry both `element` and `module`.
 * @param {unknown} ui
 * @returns {string[]}
 */
export function uiModules(ui) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {unknown} v */
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== "object" || v === null) return;
    const o = /** @type {Record<string, unknown>} */ (v);
    if ("element" in o && typeof o.module === "string") found.add(resolveRelative("x.js", o.module) ?? o.module);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  const u = /** @type {Record<string, unknown> | null} */ (ui);
  if (u) for (const k of ["stage", "inputs", "tiles"]) walk(u[k]);
  return [...found].sort();
}

/**
 * K015 and K016: the manifest's `elements` and the modules the UI names must be the same set.
 * @param {string[]} elements  the manifest's `elements` (empty when it has none)
 * @param {unknown} ui  the loaded UI, or null when the package has none
 * @returns {import("./package.js").PackageDiagnostic[]}
 */
export function checkElements(elements, ui) {
  const named = uiModules(ui);
  const listed = new Set(elements);
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const out = [];
  for (const p of named) if (!listed.has(p)) out.push(diag("K015", `the UI names the element module ${p}, but "elements" in ${MANIFEST_PATH} does not list it`, `add "${p}" to "elements"`, MANIFEST_PATH));
  for (const p of [...listed].sort()) if (!named.includes(p)) out.push(diag("K016", `"elements" lists ${p}, but no custom element in the UI names it as its module`, `remove "${p}" from "elements", or name it as the module of an element in the UI`, MANIFEST_PATH));
  return out;
}
