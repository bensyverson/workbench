// Loading a relay leg on the real kit: a package folder through kit/package (with its runtime, when the manifest
// names one), and a composition: its packages loaded and their examples checked, the glue's imports read by
// kit/compose's scanGlue, the glue imported with each bare package name resolved to its package's
// `entry.grammar` (a Node module hook), its default export called with an empty frozen `$`, and the composition's
// `check` and `plan` with each part's module scope.

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { KIT_VERSION } from "../../../kit/define/index.js";
import { loadPackage, checkExamples, textOf, MANIFEST_PATH } from "../../../kit/package/index.js";
import { scanGlue, isComposition, formatDiagnostic } from "../../../kit/compose/index.js";
import { installHooks } from "../../ui-trial/checker/hooks.js";
import { session, begin } from "../../ui-trial/checker/session.js";
import { readPackageDir } from "../../pkg/dir.js";
import { scopeModules, buildOptions } from "../../pkg-trial/checker/scope.js";

const COMPOSE_URL = new URL("../../../kit/compose/index.js", import.meta.url).href;

/** @typedef {{ file: string, line: number, code: string, message: string, fix?: string, sides?: string[] }} Found */
/** `sides`: a composition diagnostic's two sides, as kit/compose prints them (`from: …`, `to: …`). */

/** The glue's bare package names, resolved for the glue only. */
/** @type {{ url: string, packages: Record<string, string> }} */
const glue = { url: "", packages: {} };
let hooked = false;
function installGlueHooks() {
  installHooks();
  if (hooked) return;
  hooked = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (!glue.url || (context.parentURL ?? "").replace(/\?.*$/, "") !== glue.url) return next(specifier, context);
      if (specifier === "kit/compose") return { url: COMPOSE_URL, format: "module", shortCircuit: true };
      if (Object.hasOwn(glue.packages, specifier)) return { url: glue.packages[specifier], format: "module", shortCircuit: true };
      return next(specifier, context);
    },
  });
}

/** The fix each coded error a glue can throw while it builds takes. @type {Record<string, string>} */
const THROWN_FIX = {
  S301: "pass a handle (part.out.<port>, part.in.<port>, part.frame.<name>) only to .wire and .frame; don't read its properties",
};

/**
 * What the glue's default export threw, as a diagnostic: a kit error with a `code` (a handle's unknown property is
 * S301, with its `file` and `loc`) at its line; anything else LOAD at the glue.
 * @param {unknown} e @param {string} dirUrl @param {string} gluePath
 * @returns {Found}
 */
function thrown(e, dirUrl, gluePath) {
  const err = /** @type {Error & { code?: unknown, file?: unknown, loc?: { start?: { line?: number } } }} */ (e);
  const message = err?.message ?? String(e);
  if (typeof err?.code === "string" && /^[A-Z]\d{3}$/.test(err.code)) {
    const url = typeof err.file === "string" ? err.file.replace(/\?.*$/, "") : "";
    const file = url.startsWith(dirUrl) ? decodeURIComponent(url.slice(dirUrl.length)) : gluePath;
    return { file, line: err.loc?.start?.line ?? 1, code: err.code, message: message.replace(/ \([A-Z]\d{3} at [^)]*\)$/, ""), fix: THROWN_FIX[err.code] ?? "see the message" };
  }
  return { file: gluePath, line: 1, code: "LOAD", message: `the default export threw: ${message}`, fix: "make the default export ($) => compose(…)… run without throwing" };
}

/**
 * One package folder loaded by kit/package with its examples checked; `prefix` goes before each diagnostic's file.
 * The caller has called `begin` for this check.
 * @param {string} pkgDir @param {string} prefix
 * @returns {Promise<{ diagnostics: Found[], loaded: any, grammarUrl: string }>}
 */
async function loadOne(pkgDir, prefix) {
  const files = readPackageDir(pkgDir);
  const base = pathToFileURL(realpathSync(pkgDir)).href + "/";
  // what the defineUI stand-in reads a UI's element modules from: this package's files
  session.moduleText = (path) => { const f = files[path.replace(/^\.\//, "")]; return f === undefined ? null : textOf(f); };
  const importModule = (/** @type {string} */ path) => import(`${base}${path}?run=${session.run}`);
  const pkg = await loadPackage(files, { kitVersion: KIT_VERSION, importModule });
  /** @type {Found[]} */
  const found = pkg.diagnostics.map((d) => ({ file: `${prefix}${d.file ?? MANIFEST_PATH}`, line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix }));
  if (found.length) return { diagnostics: found, loaded: pkg, grammarUrl: "" };
  scopeModules(base, [...pkg.examples, ...pkg.refusals.map((r) => r.module)], files);
  for (const d of await checkExamples(pkg, { importModule, buildOptions })) found.push({ file: `${prefix}${d.file ?? MANIFEST_PATH}`, line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix });
  const manifest = JSON.parse(textOf(files[MANIFEST_PATH]) ?? "");
  return { diagnostics: found, loaded: pkg, grammarUrl: `${base}${manifest.entry.grammar}?run=${session.run}` };
}

/**
 * A package folder, loaded with its runtime and its examples checked (no UI checks: the package trial's checker
 * runs those). `examples` holds each example's module, for a run.
 * @param {string} dir
 * @returns {Promise<{ diagnostics: Found[], loaded: any, importModule: (path: string) => Promise<any> }>}
 */
export async function loadPackageDir(dir) {
  installHooks();
  const base = pathToFileURL(realpathSync(dir)).href + "/";
  begin(base);
  const r = await loadOne(dir, "");
  return { diagnostics: r.diagnostics, loaded: r.loaded, importModule: (path) => import(`${base}${path}?run=${session.run}`) };
}

/**
 * A compose leg: what the checker checks, with what a run needs besides: the loaded packages (each with its
 * runtime when its manifest names one), the composition and the options it was checked with. `composition` is
 * null when a package or the glue was refused before the glue ran. `warnings` are the check's warnings (S116 under an
 * overflow policy, S206) as note lines: they never fail a leg.
 * @param {string} dir  holds the glue and one folder per package, named as the package
 * @param {string[]} names  the packages, in order
 * @param {{ glue?: string }} [o]  the glue's path under `dir` (default workbench.js)
 * @returns {Promise<{ diagnostics: Found[], warnings: string[], plan: string[], loaded: any[], composition: any, options: any }>}
 */
export async function loadCompose(dir, names, { glue: gluePath = "workbench.js" } = {}) {
  installGlueHooks();
  const dirUrl = pathToFileURL(realpathSync(dir)).href + "/";
  begin(dirUrl);
  /** @type {Found[]} */
  const found = [];
  /** @type {any[]} */
  const loaded = [];
  /** @type {Record<string, string>} */
  const urls = {};
  for (const name of names) {
    const r = await loadOne(join(dir, name), `${name}/`);
    found.push(...r.diagnostics);
    if (r.diagnostics.length) continue;
    urls[name] = r.grammarUrl;
    loaded.push(r.loaded);
  }
  const none = { warnings: /** @type {string[]} */ ([]), plan: [], loaded, composition: null, options: null };
  if (found.length) return { diagnostics: found, ...none };
  const text = readFileSync(join(dir, gluePath), "utf8");
  for (const d of scanGlue(text, names).diagnostics) found.push({ file: gluePath, line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix });
  if (found.length) return { diagnostics: found, ...none };
  glue.url = `${dirUrl}${gluePath}`;
  glue.packages = urls;
  try {
    scopeModules(dirUrl, [gluePath], { [gluePath]: text });
    const mod = await import(`${glue.url}?run=${session.run}`);
    /** @type {any} */
    let c;
    try { c = typeof mod.default === "function" ? mod.default(Object.freeze({})) : undefined; } catch (e) {
      return { diagnostics: [thrown(e, dirUrl, gluePath)], ...none };
    }
    if (!isComposition(c)) return { diagnostics: [{ file: gluePath, line: 1, code: "LOAD", message: "the default export is not a function ($) => composition", fix: 'export default ($) => compose("name").part(…)…' }], ...none };
    // with every runtime to hand, check sees their Event maxes, so S116 is a diagnostic here and not a build's throw
    const runtimes = loaded.every((p) => p.runtime) ? { runtimes: loaded.map((p) => p.runtime) } : {};
    const options = { packages: loaded, build: buildOptions(gluePath, mod), ...runtimes };
    /** @type {string[]} */
    const warnings = [];
    for (const d of c.check(options)) {
      const lines = formatDiagnostic(d, dirUrl).split("\n");
      const m = /^(.*?)(?:\?run=\d+)?:(\d+): /.exec(lines[0]);
      const fix = lines.find((l) => l.trim().startsWith("fix: "))?.trim().slice(5);
      const sides = lines.slice(1).filter((l) => !l.trim().startsWith("fix: ")).map((l) => l.trim());
      const f = { file: m ? m[1] : gluePath, line: m ? Number(m[2]) : 1, code: d.code, message: d.message, fix: fix ?? d.fix, ...(sides.length ? { sides } : {}) };
      if (d.severity === "warning") warnings.push([`${f.file}:${f.line}: ${f.code} (warning) ${f.message}`, ...(f.fix ? [`  fix: ${f.fix}`] : [])].join("\n"));
      else found.push(f);
    }
    return { diagnostics: found, warnings, plan: found.length ? [] : c.plan(options), loaded, composition: c, options };
  } finally { glue.url = ""; glue.packages = {}; }
}
