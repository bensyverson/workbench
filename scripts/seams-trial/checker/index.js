// The seams trial checker's library: `checkRole(dir, role)`. For the two authors' legs (maze, particles) <dir> is a
// package: it gets the package trial's checks (manifest, hashes, imports, examples, UI), with the seams stand-in
// as its kit/define, then its D codes placed at lines and the leg's task checks. For the composer's leg <dir>
// holds workbench.js beside maze/ and particles/: both packages are checked as above, then the glue runs against
// the kit/compose stand-in and its composition is checked (S…), then the task (G…).
// The hand-in's files load in this process with your privileges: this is not a sandbox.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkPackageDir, CheckTargetError } from "../../pkg-trial/checker/index.js";
import { scopeModules, buildOptions } from "../../pkg-trial/checker/scope.js";
import { session as uiSession, begin } from "../../ui-trial/checker/session.js";
import { locatePos, lineAt } from "../../ui-trial/checker/locate.js";
import { MANIFEST_PATH } from "../../../kit/package/index.js";
import { installHooks, glue } from "./hooks.js";
import { registry, resetRegistry, builders } from "./registry.js";
import { composeSession, isComposition } from "./compose.js";
import { mazeTask, particlesTask, composeTask } from "./task.js";
import { forbiddenReads, conditionReads } from "./glue-scan.js";
import { placeSeam } from "./place.js";
import { LOAD } from "./codes.js";

/** @import { Violation, Side } from "./codes.js" */
/** @import { Analysis } from "./compose.js" */

export { CheckTargetError };

export const ROLES = Object.freeze(["maze", "particles", "compose"]);
export const GLUE_FILE = "workbench.js";

/** @typedef {{ ok: boolean, diagnostics: Violation[], files: string[], wires?: Array<{ from: string, to: string, convert: string[], dropped: string[] }> }} CheckResult */

/** @param {string} p */
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
/** @param {string} p */
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
/** @param {string} dir */
const urlOf = (dir) => pathToFileURL(realpathSync(dir)).href + "/";

/** The manifest of a package folder, or null. @param {string} dir @returns {Record<string, any> | null} */
function manifestOf(dir) {
  try { return JSON.parse(readFileSync(join(dir, MANIFEST_PATH), "utf8")); } catch { return null; }
}

/**
 * Checks one leg's hand-in.
 * @param {string} dir @param {"maze" | "particles" | "compose"} role
 * @returns {Promise<CheckResult>}
 */
export async function checkRole(dir, role) {
  if (!ROLES.includes(role)) throw new Error(`unknown role '${role}'`);
  const root = resolve(dir);
  if (!isDir(root)) throw new CheckTargetError(`${dir} does not exist (or is not a directory)`);
  installHooks();
  if (role !== "compose") return checkPackage(root, role);
  return checkCompose(root);
}

/**
 * One package: the package trial's checks with the seams stand-in, its refused definitions as D codes, and (when it
 * is otherwise clean) its leg's task.
 * @param {string} root @param {"maze" | "particles"} role @param {string} [prefix]  a path to put before every file (compose's maze/)
 * @returns {Promise<CheckResult & { loaded: { seams: any, grammar: any, builder: any } | null }>}
 */
async function checkPackage(root, role, prefix = "") {
  const dirUrl = urlOf(root);
  resetRegistry(dirUrl);
  const manifest = manifestOf(root);
  if (manifest) registry.packages.push({ dirUrl, name: String(manifest.name), version: String(manifest.version) });
  const r = await checkPackageDir(root);
  /** @type {Violation[]} */
  let diagnostics = r.diagnostics.map((d) => ({ ...d }));
  // A refused definition loads as K011 with the kit's whole message; the stand-in kept each problem with its path.
  if (registry.refusals.length) {
    diagnostics = diagnostics.filter((d) => !(d.code === "K011" && /define(Dialect|Grammar) refused/.test(d.message)));
    for (const ref of registry.refusals) {
      for (const p of ref.diagnostics) {
        const file = typeof p.file === "string" && p.file.startsWith(dirUrl) ? decodeURIComponent(p.file.slice(dirUrl.length)).replace(/\?.*$/, "") : (manifest?.entry?.dialect ?? MANIFEST_PATH);
        let text = "";
        try { text = readFileSync(join(root, file), "utf8"); } catch { /* the file is gone: line 1 */ }
        const call = text.indexOf(ref.what === "defineDialect" ? "defineDialect(" : "defineGrammar(");
        // locatePos searches from a defineUI call, else from the top: a package file holds one declaration
        const pos = p.path?.length ? locatePos(text, p.path, ref.decl) : Math.max(0, call);
        diagnostics.push({ file, line: text ? lineAt(text, pos) + (p.line ? p.line - 1 : 0) : 1, code: p.code, severity: "error", message: `${ref.what}: ${p.message}`, fix: p.tip });
      }
    }
  }
  // a seam problem an example's lowering found is the Dialect's, at its port or frame: once, however many examples show it
  const placedSeams = new Set();
  for (const { diagnostic: d, file, decl } of registry.seamLowerings) {
    const at = placeSeam(d, file, decl, dirUrl) ?? { file: manifest?.entry?.dialect ?? MANIFEST_PATH, line: 1 };
    const key = `${d.code}|${at.file}|${at.line}|${d.message}`;
    if (placedSeams.has(key)) continue;
    placedSeams.add(key);
    diagnostics.push({ ...at, code: d.code, severity: "error", message: d.message, fix: d.tip });
  }
  /** @type {{ seams: any, grammar: any, builder: any } | null} */
  let loaded = null;
  if (manifest?.entry?.grammar && !diagnostics.some((d) => d.code === "K011" || /^D0(2[4-9]|3[01])$/.test(d.code) || d.code === "LOAD")) {
    try {
      const mod = await import(`${dirUrl}${manifest.entry.grammar}?run=${uiSession.run}`);
      const builder = Object.values(mod).find((v) => typeof v === "function" && builders.has(v));
      const info = builder ? builders.get(builder) : undefined;
      if (info) loaded = { seams: info.seams, grammar: info.grammar, builder };
    } catch { /* the package check already said why */ }
  }
  if (loaded && !diagnostics.length) {
    const files = Object.fromEntries(r.files.filter((f) => f !== MANIFEST_PATH && /\.(js|json|md)$/.test(f)).map((f) => [f, readFileSync(join(root, f), "utf8")]));
    const task = role === "maze"
      ? mazeTask(loaded.seams, files, manifest?.entry?.dialect ?? MANIFEST_PATH)
      : particlesTask(loaded.seams, loaded.grammar, files, manifest?.examples ?? [], manifest?.entry?.dialect ?? MANIFEST_PATH, manifest?.entry?.grammar ?? MANIFEST_PATH);
    for (const t of task) diagnostics.push({ ...t, severity: "error" });
  }
  diagnostics = diagnostics.map((d) => ({ ...d, file: prefix + d.file }));
  diagnostics.sort(byPlace);
  return { ok: diagnostics.length === 0, diagnostics, files: r.files.map((f) => prefix + f), loaded };
}

/** @param {Violation} x @param {Violation} y */
const byPlace = (x, y) => (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1);

/**
 * The composer's hand-in: both packages, then the glue.
 * @param {string} root @returns {Promise<CheckResult>}
 */
async function checkCompose(root) {
  if (!isFile(join(root, GLUE_FILE))) throw new CheckTargetError(`${join(root, GLUE_FILE)} does not exist (or is not a file)`);
  for (const p of ["maze", "particles"]) if (!isDir(join(root, p))) throw new CheckTargetError(`${join(root, p)} does not exist (or is not a directory): the compose hand-in holds ${GLUE_FILE} beside maze/ and particles/`);
  /** @type {Violation[]} */
  const diagnostics = [];
  /** @type {string[]} */
  const files = [GLUE_FILE];
  /** @type {Record<string, string>} */
  const entries = {};
  for (const role of /** @type {const} */ (["maze", "particles"])) {
    const r = await checkPackage(join(root, role), role, `${role}/`);
    // the composer's leg does not re-judge the authors' tasks; an edit of a package file is the composer's own (G005)
    for (const d of r.diagnostics) {
      if (/^G1/.test(d.code)) continue;
      diagnostics.push(d);
      if (d.code === "K006") diagnostics.push({ ...d, code: "G005", message: `the composer may not edit a package's files: ${d.message}`, fix: `restore ${d.file} as the ${role} author handed it in; every frame fact goes in ${GLUE_FILE}` });
    }
    files.push(...r.files);
    const m = manifestOf(join(root, role));
    if (m?.entry?.grammar) entries[role] = m.entry.grammar;
  }

  const dirUrl = urlOf(root);
  resetRegistry(dirUrl);
  for (const role of ["maze", "particles"]) {
    const m = manifestOf(join(root, role));
    if (m) registry.packages.push({ dirUrl: `${dirUrl}${role}/`, name: String(m.name), version: String(m.version) });
  }
  begin(dirUrl);
  const text = readFileSync(join(root, GLUE_FILE), "utf8");
  uiSession.moduleText = () => null;
  scopeModules(dirUrl, [GLUE_FILE], { [GLUE_FILE]: text });
  glue.url = `${dirUrl}${GLUE_FILE}`;
  glue.packages = Object.fromEntries(Object.entries(entries).map(([n, e]) => [n, `${dirUrl}${n}/${e}`]));
  /** @param {number} line @param {string} code @param {string} message @param {string} fix @param {{ from?: Side, to?: Side }} [sides] */
  const add = (line, code, message, fix, sides = {}) => diagnostics.push({ file: GLUE_FILE, line, code, severity: "error", message, fix, ...sides });
  const done = () => {
    glue.url = "";
    diagnostics.sort(byPlace);
    return { ok: diagnostics.length === 0, diagnostics, files };
  };
  // the packages must load for the glue to mean anything
  if (diagnostics.some((d) => d.code === "K011" || d.code === "LOAD" || /^D0(2[4-9]|3[01])$/.test(d.code))) return done();

  // what the glue may not import is decided from its text, and a glue that makes one such import is not loaded
  const forbidden = forbiddenReads(text, Object.keys(entries));
  for (const f of forbidden) add(f.line, "C006", `${GLUE_FILE} ${f.what}; the glue program may import only "kit/compose", "kit/define", "maze" and "particles"`, "remove it; write what you need in workbench.js");
  if (forbidden.length) return done();
  /** @type {Record<string, unknown>} */
  let mod;
  try {
    mod = await import(`${dirUrl}${GLUE_FILE}?run=${uiSession.run}`);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    const site = String(err.stack ?? "").match(new RegExp(`${escape(dirUrl)}([^\\s():?]+)(?:\\?[^\\s():]*)?:(\\d+)`));
    diagnostics.push({ file: site ? decodeURIComponent(site[1]) : GLUE_FILE, line: site ? Number(site[2]) : 1, code: LOAD, severity: "error", message: `${GLUE_FILE} does not load: ${err.message}`, fix: "fix the file so it loads; run node on it to see the error" });
    return done();
  }
  const exportLine = (() => { const at = text.search(/export\s+default/); return at < 0 ? 1 : lineAt(text, at); })();
  const fn = mod.default;
  if (typeof fn !== "function") { add(exportLine, "G006", `${GLUE_FILE}'s default export is ${fn === undefined ? "missing" : "not a function"}`, "export default ($) => { …; return compose(\"…\").part(…)…; };"); return done(); }
  const options = buildOptions(GLUE_FILE, mod);
  composeSession.options = /** @type {Record<string, unknown>} */ (options);
  /** @type {unknown} */
  let comp;
  try {
    comp = fn(Object.freeze({}));
  } catch (e) {
    const err = /** @type {Error & { diagnostics?: any[] }} */ (e);
    if (Array.isArray(err.diagnostics)) {
      for (const d of err.diagnostics) {
        const at = placeIn(d, dirUrl) ?? { file: GLUE_FILE, line: exportLine };
        diagnostics.push({ ...at, code: d.code, severity: "error", message: d.message, fix: d.fix ?? d.tip ?? "", ...(d.from ? { from: d.from } : {}), ...(d.to ? { to: d.to } : {}) });
      }
    } else add(exportLine, LOAD, `${GLUE_FILE}'s default export threw: ${err?.message ?? String(err)}`, "fix the glue so it runs");
    return done();
  }
  if (comp instanceof Promise) {
    comp.catch(() => {}); // its rejection is this mistake's, not an unhandled one
    add(exportLine, "G006", `${GLUE_FILE}'s default export returns a Promise: it is async, and a composition is built synchronously`, "drop async: export default ($) => { …; return compose(\"…\")…; };");
    return done();
  }
  if (!isComposition(comp)) { add(exportLine, "G006", `${GLUE_FILE}'s default export returns ${comp === undefined ? "nothing" : "something other than a composition"}`, "return compose(\"…\").part(…)…, without .build()"); return done(); }
  /** @type {Analysis} */
  let a;
  try {
    a = /** @type {any} */ (comp).analyze();
  } catch (e) {
    // a check the stand-in did not foresee: say so with a code, at the glue, rather than fail the whole checker
    add(exportLine, LOAD, `the composition could not be checked: ${/** @type {Error} */ (e)?.message ?? String(e)}`, "simplify what the glue passes to .part, .frame and .wire to plain values, and report this with the file");
    return done();
  }
  for (const d of a.diagnostics) diagnostics.push({ file: d.file, line: d.line, code: d.code, severity: "error", message: d.message, fix: d.fix, ...(d.from ? { from: d.from } : {}), ...(d.to ? { to: d.to } : {}) });
  for (const line of conditionReads(text)) add(line.line, "S301", `${line.handle} is tested as a value at build time; a handle is not a value: it only names a port or a frame, for .wire and .frame`, "pass the handle to .wire or .frame; values flow only when the parts run");
  if (!diagnostics.length) for (const t of composeTask(a, { file: GLUE_FILE, line: exportLine })) diagnostics.push({ ...t, severity: "error" });
  const result = done();
  return { ...result, wires: a.wires.filter((w) => w.ok).map((w) => ({ from: `${partNameOf(w.from)}.out.${w.from.name}`, to: `${partNameOf(w.to)}.in.${w.to.name}`, convert: w.convert.map((c) => c.text), dropped: w.dropped })) };
}

/** @param {any} h */
const partNameOf = (h) => h.program?.root?.openCall?.args?.[0] ?? "?";

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where a diagnostic thrown inside the glue points, when that is in the hand-in: a kit one's file URL and loc, or a
 * composition's own relative file and line.
 * @param {any} d @param {string} dirUrl @returns {{ file: string, line: number } | null}
 */
function placeIn(d, dirUrl) {
  if (typeof d.file !== "string") return null;
  if (d.file.startsWith(dirUrl) && d.loc?.start?.line) return { file: decodeURIComponent(d.file.slice(dirUrl.length)).replace(/\?.*$/, ""), line: d.loc.start.line };
  if (!d.file.includes(":") && typeof d.line === "number") return { file: d.file, line: d.line };
  return null;
}
