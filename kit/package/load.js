// loadPackage: check the files, then import the three entry modules through the host's importer and check
// that what they export fits together. The kit never fetches or touches a file system: `importModule` is the host's.
//
// Entry export rule: each entry module exports exactly one value of its kind, found by value, not by name:
// the Dialect file one defineDialect result, the Grammar file one defineGrammar builder, the UI file one defineUI
// value. Other exports (a constant, a helper) are free, and one value exported under two names counts once.

import { isDialect } from "../define/dialect.js";
import { isUI } from "../define/ui.js";
import { KIT_VERSION } from "../define/version.js";
import { checkPackage } from "./check.js";
import { diag } from "./codes.js";
import { contentKey } from "./hash.js";
import { MANIFEST_PATH } from "./manifest.js";

/** @param {unknown} v */
const isBuilder = (v) => typeof v === "function" && isDialect(/** @type {any} */ (v).dialect) && /** @type {any} */ (v).grammar !== undefined;

/** @type {Record<string, { what: string, is: (v: unknown) => boolean }>} */
const KINDS = {
  dialect: { what: "defineDialect result (a Dialect)", is: isDialect },
  grammar: { what: "defineGrammar result (a Grammar builder)", is: isBuilder },
  ui: { what: "defineUI result (a UI)", is: isUI },
};

/**
 * Loads a package: the loaded parts when it is sound, else its diagnostics.
 * @param {Record<string, string>} files
 * @param {{ importModule: (path: string) => Promise<Record<string, unknown>>, kitVersion?: string }} options
 * @returns {Promise<import("./package.js").LoadedPackage>}
 */
export async function loadPackage(files, { importModule, kitVersion = KIT_VERSION }) {
  const { manifest, diagnostics } = await checkPackage(files, { kitVersion });
  /** @type {import("./package.js").LoadedPackage} */
  const out = { name: manifest?.name ?? null, version: manifest?.version ?? null, content: null, dialect: null, grammar: null, ui: null, examples: [], foreign: [], diagnostics };
  if (!manifest || diagnostics.length) return out;
  /** @type {Record<string, unknown>} */
  const found = {};
  for (const kind of /** @type {const} */ (["dialect", "grammar", "ui"])) {
    const path = manifest.entry[kind];
    if (path === undefined) continue;
    /** @type {Record<string, unknown>} */
    let mod;
    try { mod = await importModule(path); } catch (e) {
      diagnostics.push(diag("K011", `${path} failed to import: ${/** @type {Error} */ (e)?.message ?? String(e)}`, `fix the error in ${path}; the checker for a package folder (scripts/pkg-trial/check.js) prints it with its line`, path));
      return out;
    }
    const k = KINDS[kind];
    const values = [...new Set(Object.values(mod ?? {}).filter(k.is))];
    if (values.length === 1) found[kind] = values[0];
    else diagnostics.push(diag("K008", values.length ? `${path} exports ${values.length} ${k.what}s; the ${kind} entry exports exactly one` : `${path} exports no ${k.what}; the ${kind} entry exports exactly one`, `export the ${kind} the package defines from ${path}`, path));
  }
  const dialect = /** @type {any} */ (found.dialect);
  const grammar = /** @type {any} */ (found.grammar);
  const ui = /** @type {any} */ (found.ui);
  if (dialect && dialect.name !== manifest.name) diagnostics.push(diag("K008", `the Dialect in ${manifest.entry.dialect} is named "${dialect.name}", but the manifest names the package "${manifest.name}"`, `make defineDialect's name and the manifest's "name" the same`, manifest.entry.dialect));
  if (dialect && grammar && grammar.dialect !== dialect) diagnostics.push(diag("K008", `the Grammar in ${manifest.entry.grammar} is not built on the Dialect in ${manifest.entry.dialect}`, `build it with defineGrammar(<the Dialect imported from ./${manifest.entry.dialect}>, …)`, manifest.entry.grammar));
  if (grammar && ui && ui.builder !== grammar) diagnostics.push(diag("K008", `the UI in ${manifest.entry.ui} is not built on the Grammar in ${manifest.entry.grammar}`, `build it with defineUI(<the Grammar builder imported from ./${manifest.entry.grammar}>, …)`, manifest.entry.ui));
  if (diagnostics.length) return out;
  return { ...out, content: await contentKey(manifest.files), dialect, grammar, ui: ui ?? null, examples: manifest.examples ?? [], foreign: manifest.foreign ?? [] };
}

export { MANIFEST_PATH };
