// The bundle: a package as one JSON file, `{ "format": "wb-bundle", "files": { path: text | { base64 } } }`, read
// as the same { path: text | bytes } map as a set of files. A binary file (a PNG) is `{ "base64": "<…>" }` in place
// of its text, so a bundle with no binary file is as it was before data files. `scripts/pkg/bundle.js` writes one.

import { diag } from "./codes.js";
import { isPackagePath } from "./paths.js";
import { fromBase64, toBase64 } from "./content.js";

export const BUNDLE_FORMAT = "wb-bundle";

/** @param {string} text @returns {{ files: Record<string, import("./content.js").FileContent> | null, diagnostics: import("./package.js").PackageDiagnostic[] }} */
export function readBundle(text) {
  const bad = (/** @type {string} */ why) => ({ files: null, diagnostics: [diag("K010", `the bundle is not a package bundle: ${why}`, `write it with scripts/pkg/bundle.js <dir>, or as { "format": "${BUNDLE_FORMAT}", "files": { "<path>": "<text>" or { "base64": "<bytes>" } } }`)] });
  /** @type {any} */
  let v;
  try { v = JSON.parse(text); } catch (e) { return bad(`not JSON (${/** @type {Error} */ (e).message})`); }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return bad("not a JSON object");
  if (v.format !== BUNDLE_FORMAT) return bad(`"format" is not "${BUNDLE_FORMAT}"`);
  const extra = Object.keys(v).filter((k) => k !== "format" && k !== "files");
  if (extra.length) return bad(`unknown key ${extra.map((k) => `"${k}"`).join(", ")}`);
  if (typeof v.files !== "object" || v.files === null || Array.isArray(v.files)) return bad(`"files" is not an object of path to text`);
  /** @type {Record<string, import("./content.js").FileContent>} */
  const files = {};
  for (const [p, t] of Object.entries(v.files)) {
    if (!isPackagePath(p)) return bad(`"${p}" is not a normalized relative path`);
    if (typeof t === "string") { files[p] = t; continue; }
    const isB64 = typeof t === "object" && t !== null && !Array.isArray(t) && Object.keys(t).length === 1 && typeof t.base64 === "string";
    const bytes = isB64 ? fromBase64(t.base64) : null;
    if (!bytes) return bad(`"${p}" is neither text nor { "base64": "<bytes>" }`);
    files[p] = bytes;
  }
  return { files, diagnostics: [] };
}

/** The bundle text of a { path: text | bytes } map: paths sorted, so one package makes one file. @param {Record<string, import("./content.js").FileContent>} files */
export function writeBundle(files) {
  return JSON.stringify({ format: BUNDLE_FORMAT, files: Object.fromEntries(Object.keys(files).sort().map((p) => { const c = files[p]; return [p, typeof c === "string" ? c : { base64: toBase64(c) }]; })) }, null, 2) + "\n";
}
