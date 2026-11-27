// The manifest, `wb-package.json`: data a host reads before it runs any of the package's code.

import { diag } from "./codes.js";
import { withoutBom } from "./content.js";
import { isDotPath, isModulePath, isPackagePath } from "./paths.js";

export const MANIFEST_PATH = "wb-package.json";

/** The entry modules: dialect and grammar required, ui and runtime optional. */
const ENTRIES = ["dialect", "grammar", "ui", "runtime"];
const KEYS = ["name", "version", "kit", "description", "entry", "lib", "foreign", "elements", "examples", "refusals", "files"];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const DIAGNOSTIC_CODE = /^[A-Z][0-9]{3}$/;
const HASH = /^sha256-[A-Za-z0-9+/]{43}=$/;

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reads and checks a manifest's text.
 * @param {string} text
 * @returns {{ manifest: import("./package.js").Manifest | null, diagnostics: import("./package.js").PackageDiagnostic[] }}
 */
export function checkManifest(text) {
  /** @type {unknown} */
  let m;
  try { m = JSON.parse(withoutBom(text)); } catch (e) {
    return { manifest: null, diagnostics: [diag("K001", `${MANIFEST_PATH} is not JSON (${/** @type {Error} */ (e).message})`, `write ${MANIFEST_PATH} as a JSON object: { "name", "version", "kit", "entry", "files" }`, MANIFEST_PATH)] };
  }
  if (!isObject(m)) return { manifest: null, diagnostics: [diag("K001", `${MANIFEST_PATH} is not a JSON object`, `write ${MANIFEST_PATH} as a JSON object: { "name", "version", "kit", "entry", "files" }`, MANIFEST_PATH)] };
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const ds = [];
  const bad = (/** @type {string} */ message, /** @type {string} */ fix, code = /** @type {"K002" | "K004"} */ ("K002")) => ds.push(diag(code, message, fix, MANIFEST_PATH));
  for (const k of Object.keys(m)) {
    if (!KEYS.includes(k)) bad(`${MANIFEST_PATH} has an unknown key "${k}"${k === "dependencies" ? "; a package depends on nothing but the kit and its own files" : ""}`, `remove "${k}"; the keys are ${KEYS.join(", ")}`);
  }
  /** A path field: a normalized relative path to a module (`.js`), no glob. */
  const path = (/** @type {unknown} */ v, /** @type {string} */ where) => {
    if (typeof v !== "string") { bad(`${where} must be a path string`, `write ${where} as a path such as "lib/noise.js"`); return false; }
    if (v.includes("*") || v.includes("?")) { bad(`${where} is "${v}": a glob; v0 lists exact paths`, `list each file by its exact path`); return false; }
    if (!isPackagePath(v)) { bad(`${where} is "${v}", not a normalized relative path (no leading "/", ".", "..", empty part or backslash)`, `write it relative to the package folder, with "/", such as "lib/noise.js"`); return false; }
    if (!isModulePath(v)) { bad(`${where} is "${v}", which does not end in ".js"; a package's modules are exactly its .js files`, `name a file whose name ends in ".js" (lowercase), such as "lib/noise.js"`); return false; }
    return true;
  };
  if (typeof m.name !== "string" || !/^[a-z][a-z0-9]*$/.test(m.name)) bad(`"name" must be lowercase letters and digits, starting with a letter${typeof m.name === "string" ? ` (got "${m.name}")` : ""}`, `write "name": "tiles"; it is the Dialect's name and the prefix of the UI's custom elements`);
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) bad(`"version" must be a semantic version such as "0.4.0"${typeof m.version === "string" ? ` (got "${m.version}")` : ""}`, `write "version": "0.1.0"`);
  if (typeof m.kit !== "string" || !/^\d+\.\d+$/.test(m.kit)) bad(`"kit" must be the Definition API version as major.minor, such as "0.4"${typeof m.kit === "string" ? ` (got "${m.kit}")` : ""}`, `write "kit": "0.4" (KIT_VERSION from kit/define)`);
  if (m.description !== undefined && typeof m.description !== "string") bad(`"description" must be a string`, `write a sentence, or remove it`);
  /** @type {string[]} */
  const named = [];
  if (!isObject(m.entry)) bad(`"entry" must be an object with "dialect" and "grammar" (and "ui" and "runtime" if the package has them)`, `write "entry": { "dialect": "x.dialect.js", "grammar": "x.grammar.js" }`);
  else {
    for (const k of Object.keys(m.entry)) if (!ENTRIES.includes(k)) bad(`"entry" has an unknown key "${k}"`, `entry takes dialect, grammar, ui and runtime`);
    for (const k of ENTRIES) {
      const v = m.entry[k];
      if (v === undefined) { if (k === "dialect" || k === "grammar") bad(`"entry.${k}" is missing`, `name the file that exports the package's ${k}`); } else if (path(v, `"entry.${k}"`)) named.push(/** @type {string} */ (v));
    }
  }
  for (const k of ["lib", "elements", "examples"]) {
    const v = m[k];
    if (v === undefined) continue;
    if (!Array.isArray(v)) { bad(`"${k}" must be an array of file paths`, `write "${k}": ["${k}/a.js"]`); continue; }
    v.forEach((p, i) => { if (path(p, `"${k}[${i}]"`)) named.push(p); });
  }
  if (m.refusals !== undefined) {
    if (!Array.isArray(m.refusals)) bad(`"refusals" must be an array of { module, code }`, `write "refusals": [{ "module": "refusals/r01.js", "code": "L004" }]`);
    else m.refusals.forEach((r, i) => {
      const at = `"refusals[${i}]"`;
      if (!isObject(r)) { bad(`${at} must be { module, code }`, `write { "module": "refusals/r01.js", "code": "L004" }`); return; }
      for (const k of Object.keys(r)) if (!["module", "code"].includes(k)) bad(`${at} has an unknown key "${k}"`, `refusals takes module and code`);
      if (path(r.module, `${at}.module`)) {
        named.push(/** @type {string} */ (r.module));
        if (Array.isArray(m.examples) && m.examples.includes(r.module)) bad(`${at}.module "${r.module}" is also in "examples"; an example must build clean and a refusal must be refused`, `list the file in one of the two`);
      }
      if (typeof r.code !== "string" || !DIAGNOSTIC_CODE.test(r.code)) bad(`${at}.code must be a diagnostic code: a capital letter and three digits${typeof r.code === "string" ? ` (got "${r.code}")` : ""}`, `write "code": "L004", the code the kit refuses the module with`);
    });
  }
  if (m.foreign !== undefined) {
    if (!Array.isArray(m.foreign)) bad(`"foreign" must be an array of { module, targets, why }`, `write "foreign": [{ "module": "foreign/x.js", "targets": ["js"], "why": "what it is for" }]`);
    else m.foreign.forEach((f, i) => {
      const at = `"foreign[${i}]"`;
      if (!isObject(f)) { bad(`${at} must be { module, targets, why }`, `write { "module": "foreign/x.js", "targets": ["js"], "why": "what it is for" }`); return; }
      for (const k of Object.keys(f)) if (!["module", "targets", "why"].includes(k)) bad(`${at} has an unknown key "${k}"`, `foreign takes module, targets and why`);
      if (path(f.module, `${at}.module`)) named.push(/** @type {string} */ (f.module));
      if (!Array.isArray(f.targets) || f.targets.length === 0 || !f.targets.every((t) => typeof t === "string" && t !== "")) bad(`${at}.targets must be a non-empty array of target names`, `write "targets": ["js"]`);
      if (typeof f.why !== "string" || f.why.trim() === "") bad(`${at}.why must say why the module is foreign`, `write "why": "what it is for"`);
    });
  }
  if (!isObject(m.files)) bad(`"files" must be an object of path to "sha256-<base64>"`, `run node scripts/pkg/hash.js <dir> to write it`);
  else {
    for (const [p, h] of Object.entries(m.files)) {
      if (!isPackagePath(p)) bad(`"files" lists "${p}", not a normalized relative path`, `list each file by its path relative to the package folder`);
      else if (isDotPath(p)) bad(`"files" lists "${p}", a dotfile: a path with a part starting with "." is not part of a package`, `remove it from "files"`);
      if (typeof h !== "string" || !HASH.test(h)) bad(`"files" gives "${p}" the hash ${JSON.stringify(h)}, not "sha256-<base64>"`, `run node scripts/pkg/hash.js <dir> to write it`);
    }
    if (!ds.length) for (const p of new Set(named)) if (!Object.hasOwn(m.files, p)) bad(`${p} is named in the manifest but is not in "files"`, `run node scripts/pkg/hash.js <dir> after adding the file, or remove the name`, "K004");
  }
  if (ds.length) return { manifest: null, diagnostics: ds };
  return { manifest: /** @type {import("./package.js").Manifest} */ (/** @type {unknown} */ (m)), diagnostics: [] };
}
