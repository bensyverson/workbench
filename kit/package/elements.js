// The modules a UI names: every custom element on its stage and in its tiles carries a `module` path, which the
// package's `modules` must list, no more and no fewer.

import { diag } from "./codes.js";
import { textOf } from "./content.js";
import { MANIFEST_PATH, checkManifest } from "./manifest.js";
import { resolveRelative } from "./paths.js";

/**
 * The package path an element's `module` names: relative to the UI module, as an import in it would be (null when
 * it leaves the package). The host imports that path; `uiModules` lists the same ones.
 * @param {string} uiPath  the manifest's `entry.ui` @param {string} module
 */
export const uiModulePath = (uiPath, module) => resolveRelative(uiPath, module);

/**
 * `uiModulePath` for a package's files: reads the manifest, takes its `entry.ui` (a UI at the root when it names
 * none) and names the module from it. A manifest that cannot be read is reported as kit/package reports it (K001 and
 * the manifest's other codes), with a null path; a module that leaves the package is a null path and no diagnostic.
 * @param {Record<string, string | Uint8Array>} files  the package's files by path @param {string} module  as the UI names it
 * @returns {{ path: string | null, diagnostics: import("./package.js").PackageDiagnostic[] }}
 */
export function elementModulePath(files, module) {
  const raw = Object.hasOwn(files, MANIFEST_PATH) ? files[MANIFEST_PATH] : undefined;
  if (raw === undefined) return { path: null, diagnostics: [diag("K001", `the package has no ${MANIFEST_PATH}`, `add ${MANIFEST_PATH}`)] };
  const text = textOf(raw);
  if (text === null) return { path: null, diagnostics: [diag("K001", `${MANIFEST_PATH} is not UTF-8 text`, `write ${MANIFEST_PATH} as a JSON object in UTF-8`, MANIFEST_PATH)] };
  const { manifest, diagnostics } = checkManifest(text);
  if (!manifest) return { path: null, diagnostics };
  return { path: uiModulePath(manifest.entry.ui ?? "ui.js", module), diagnostics: [] };
}

/**
 * The package paths of the trusted modules a UI names (its custom elements' and its actions'), sorted and without repeats, each relative to the
 * UI module at `uiPath` (`uiModulePath`). The UI value is plain frozen data apart from its lambdas, so this walks
 * it for objects that carry both `element` and `module`.
 * @param {unknown} ui @param {string} [uiPath]  the manifest's `entry.ui` (a module at the root, by default)
 * @returns {string[]}
 */
export function uiModules(ui, uiPath = "ui.js") {
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {unknown} v */
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== "object" || v === null) return;
    const o = /** @type {Record<string, unknown>} */ (v);
    if ("element" in o && typeof o.module === "string") found.add(uiModulePath(uiPath, o.module) ?? o.module);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  const u = /** @type {Record<string, unknown> | null} */ (ui);
  if (u) for (const k of ["stage", "tiles"]) walk(u[k]);
  // an action's module is trusted code the host imports, as an element's is (declared Controls, 2026-11-27)
  for (const a of Object.values(/** @type {Record<string, any>} */ (u?.actions ?? {}))) if (typeof a?.module === "string") found.add(uiModulePath(uiPath, a.module) ?? a.module);
  return [...found].sort();
}

/**
 * K015 and K016: the manifest's `modules` and the trusted modules the UI names (its elements' and its actions') must
 * be the same set.
 * @param {string[]} modules  the manifest's `modules` (empty when it has none)
 * @param {unknown} ui  the loaded UI, or null when the package has none
 * @param {string} [uiPath]  the manifest's `entry.ui`, which the modules are named from
 * @returns {import("./package.js").PackageDiagnostic[]}
 */
export function checkModules(modules, ui, uiPath) {
  const named = uiModules(ui, uiPath);
  const listed = new Set(modules);
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const out = [];
  for (const p of named) if (!listed.has(p)) out.push(diag("K015", `the UI names the module ${p} (a custom element's or an action's), but "modules" in ${MANIFEST_PATH} does not list it`, `add "${p}" to "modules"`, MANIFEST_PATH));
  for (const p of [...listed].sort()) if (!named.includes(p)) out.push(diag("K016", `"modules" lists ${p}, but no custom element or action in the UI names it as its module`, `remove "${p}" from "modules", or name it as the module of an element or an action in the UI`, MANIFEST_PATH));
  return out;
}
