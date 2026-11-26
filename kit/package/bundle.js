// The bundle: a package as one JSON file, `{ "format": "wb-bundle", "files": { path: text } }`, read as the same
// { path: text } map as a set of files. `scripts/pkg/bundle.js` writes one.

import { diag } from "./codes.js";
import { isPackagePath } from "./paths.js";

export const BUNDLE_FORMAT = "wb-bundle";

/** @param {string} text @returns {{ files: Record<string, string> | null, diagnostics: import("./package.js").PackageDiagnostic[] }} */
export function readBundle(text) {
  const bad = (/** @type {string} */ why) => ({ files: null, diagnostics: [diag("K010", `the bundle is not a package bundle: ${why}`, `write it with scripts/pkg/bundle.js <dir>, or as { "format": "${BUNDLE_FORMAT}", "files": { "<path>": "<text>" } }`)] });
  /** @type {any} */
  let v;
  try { v = JSON.parse(text); } catch (e) { return bad(`not JSON (${/** @type {Error} */ (e).message})`); }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return bad("not a JSON object");
  if (v.format !== BUNDLE_FORMAT) return bad(`"format" is not "${BUNDLE_FORMAT}"`);
  const extra = Object.keys(v).filter((k) => k !== "format" && k !== "files");
  if (extra.length) return bad(`unknown key ${extra.map((k) => `"${k}"`).join(", ")}`);
  if (typeof v.files !== "object" || v.files === null || Array.isArray(v.files)) return bad(`"files" is not an object of path to text`);
  for (const [p, t] of Object.entries(v.files)) {
    if (typeof t !== "string") return bad(`"${p}" is not text`);
    if (!isPackagePath(p)) return bad(`"${p}" is not a normalized relative path`);
  }
  return { files: v.files, diagnostics: [] };
}

/** The bundle text of a { path: text } map: paths sorted, so one package makes one file. @param {Record<string, string>} files */
export function writeBundle(files) {
  return JSON.stringify({ format: BUNDLE_FORMAT, files: Object.fromEntries(Object.keys(files).sort().map((p) => [p, files[p]])) }, null, 2) + "\n";
}
