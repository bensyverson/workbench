// Loading a workbench in the page: packages (each a `{ path: text | bytes }` map) through kit/package, a glue
// program through kit/compose, or one package's example as a one-part composition (a preset). The host's own parts
// are the URLs of the modules (a blob URL in the page: kit/package's `rewriteSpecifiers` makes the specifiers
// resolve), the module scope of a Program file, and turning every diagnostic of the kit's into one shape the page
// lists. No decision is made here that the kit makes: each check, each build and each refusal is the kit's.

import { KIT_VERSION, withScope, moduleScope } from "../../define/index.js";
import { rewriteGlue, callGlue, formatDiagnostic } from "../../compose/index.js";
import { examplePreset } from "../index.js";
import { loadPackage, rewriteSpecifiers, checkManifest, textOf, uiModulePath, MANIFEST_PATH } from "../../package/index.js";
import { isDotPath } from "../../package/paths.js";
import { withoutBom } from "../../package/content.js";

/**
 * One diagnostic of any source, as the page lists it. `text` is the kit's printed form where it has one.
 * @typedef {{ source: string, code: string, severity: "error" | "warning", message: string, fix?: string, file?: string, line?: number, text: string }} HostDiagnostic
 */

/**
 * What the host gives the loader.
 * @typedef {object} LoadEnv
 * @property {{ define: string, compose: string }} urls  the URLs of kit/define and kit/compose, which a package's `kit/define` and a glue's `kit/compose` become
 * @property {(text: string) => string} makeUrl  a URL a module can be imported from: a blob URL in the page
 * @property {(url: string) => Promise<any>} importUrl  `import(url)`, the host's (the kit's modules hold no dynamic import)
 */

/**
 * A loaded package as the host keeps it.
 * @typedef {{ label: string, name: string, files: Record<string, string | Uint8Array>, urls: Map<string, string>, loaded: any }} HostPackage
 */

/**
 * @param {string} source @param {any} d
 * @returns {HostDiagnostic}
 */
export function hostDiagnostic(source, d) {
  const line = d.loc?.start?.line ?? d.line;
  const text = typeof d.text === "string" ? d.text : `${d.code} ${d.message}${d.fix ? `\n  fix: ${d.fix}` : ""}`;
  return { source, code: String(d.code), severity: d.severity === "warning" ? "warning" : "error", message: String(d.message), ...(d.fix ? { fix: String(d.fix) } : {}), ...(d.file ? { file: String(d.file) } : {}), ...(typeof line === "number" ? { line } : {}), text };
}

/** @param {string} source @param {string} message @param {string} [fix] @returns {HostDiagnostic} */
const loadError = (source, message, fix) => hostDiagnostic(source, { code: "LOAD", severity: "error", message, ...(fix ? { fix } : {}) });

/**
 * Loads one package: its modules become URLs (examples with their module scope's epilogue), then kit/package's
 * `loadPackage` checks and imports it.
 * @param {string} label  where it came from (a folder name), for messages
 * @param {Record<string, string | Uint8Array>} given
 * @param {LoadEnv} env
 * @returns {Promise<{ pkg: HostPackage | null, diagnostics: HostDiagnostic[] }>}
 */
export async function loadOnePackage(label, given, env) {
  const source = `package ${label}`;
  const files = Object.fromEntries(Object.entries(given).filter(([p]) => !isDotPath(p)));
  /** @type {Map<string, string>} */
  const urls = new Map();
  const { manifest } = checkManifest(textOf(files[MANIFEST_PATH] ?? "") ?? "");
  if (manifest) {
    const examples = new Set(manifest.examples ?? []);
    const rewritten = rewriteSpecifiers(files, (p) => /** @type {string} */ (urls.get(p)), env.urls.define);
    if (rewritten.diagnostics.length) return { pkg: null, diagnostics: rewritten.diagnostics.map((d) => hostDiagnostic(source, d)) };
    for (const m of rewritten.modules) urls.set(m.path, env.makeUrl(examples.has(m.path) ? withScope(m.text) : m.text));
  }
  const loaded = await loadPackage(files, {
    kitVersion: KIT_VERSION,
    importModule: (path) => {
      const url = urls.get(path);
      if (url === undefined) throw new Error(`${path} is not a module of the package`);
      return env.importUrl(url);
    },
  });
  if (loaded.diagnostics.length) return { pkg: null, diagnostics: loaded.diagnostics.map((d) => hostDiagnostic(source, d)) };
  return { pkg: { label, name: /** @type {string} */ (loaded.name), files, urls, loaded }, diagnostics: [] };
}

/**
 * What loading the glue (or a preset) made, whatever it got as far as.
 * @typedef {object} Loaded
 * @property {HostPackage[]} packages
 * @property {HostDiagnostic[]} diagnostics  every diagnostic, errors and warnings, in the order they arose
 * @property {string[]} plan  each wire's plan line
 * @property {any} composition
 * @property {any} composed  kit/compose's built record, or null
 * @property {any[]} runtimes
 * @property {string} source  the glue's text, or the preset's example's
 * @property {string} sourceName
 * @property {Record<string, any>} options  compose's options (packages, build scope, runtimes, profile)
 * @property {((part: string, params: Record<string, unknown>) => Record<string, any>) | null} rebuild  a preset's rebuild for a build-time param edit (kit/page's examplePreset), which createRun takes as `build`; null for a glue
 */

/** @returns {Loaded} */
const nothing = () => ({ packages: [], diagnostics: [], plan: [], composition: null, composed: null, runtimes: [], source: "", sourceName: "", options: {}, rebuild: null });

/**
 * The packages of a workbench, loaded; `all` is false when one did not load.
 * @param {Record<string, Record<string, string | Uint8Array>>} packages  by label
 * @param {LoadEnv} env
 */
async function loadPackages(packages, env) {
  const out = nothing();
  for (const [label, files] of Object.entries(packages)) {
    const r = await loadOnePackage(label, files, env);
    out.diagnostics.push(...r.diagnostics);
    if (r.pkg) out.packages.push(r.pkg);
  }
  return { out, all: out.diagnostics.length === 0 };
}

/**
 * Compose's checks and build on an imported composition, into `out`.
 * @param {Loaded} out @param {any} composition @param {Record<string, any>} options @param {string} gluePath
 */
function checkAndBuild(out, composition, options, gluePath) {
  const base = (/** @type {any[]} */ list) => list.map((d) => hostDiagnostic("composition", { ...d, file: gluePath, text: formatDiagnostic({ ...d, file: gluePath }) }));
  const found = base(composition.check(options));
  out.diagnostics.push(...found);
  out.options = options;
  if (found.some((d) => d.severity === "error")) return;
  try { out.plan = composition.plan(options); } catch (e) { out.diagnostics.push(loadError("composition", `plan threw: ${message(e)}`)); }
  try { out.composed = composition.build(options); } catch (e) {
    const ds = /** @type {any} */ (e)?.diagnostics;
    if (Array.isArray(ds)) out.diagnostics.push(...base(ds.filter((d) => !found.some((f) => f.code === d.code && f.message === d.message))));
    else out.diagnostics.push(loadError("composition", `the build threw: ${message(e)}`));
  }
}

/** @param {unknown} e */
const message = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Loads packages and a glue: kit/compose's `rewriteGlue` resolves its imports (each bare name to its package's Grammar
 * module), the module is imported with its scope, kit/compose's `callGlue` calls its default export (a build-time
 * read of the glue's `$` is S104), and the composition is checked and built.
 * @param {{ packages: Record<string, Record<string, string | Uint8Array>>, glue: { path: string, text: string }, profile?: string }} input
 * @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
export async function loadWorkbench(input, env) {
  const { out, all } = await loadPackages(input.packages, env);
  out.source = input.glue.text;
  out.sourceName = input.glue.path;
  if (!all) return out;
  const { path, text } = input.glue;
  /** @type {Record<string, string>} */
  const urls = { "kit/compose": env.urls.compose, "kit/define": env.urls.define };
  for (const p of out.packages) { const url = p.urls.get(entryGrammar(p)); if (url !== undefined) urls[p.name] = url; }
  /** @type {ReturnType<typeof rewriteGlue>} */
  let rewritten;
  try { rewritten = rewriteGlue(text, urls, path); } catch (e) { out.diagnostics.push(loadError("glue", message(e))); return out; }
  if (rewritten.text === null) { out.diagnostics.push(...rewritten.diagnostics.map((d) => hostDiagnostic("glue", d))); return out; }
  /** @type {any} */
  let mod;
  try { mod = await env.importUrl(env.makeUrl(withScope(rewritten.text))); } catch (e) { out.diagnostics.push(loadError("glue", `${path} did not load: ${message(e)}`)); return out; }
  const called = callGlue(mod.default, path);
  if (!called.composition) { out.diagnostics.push(...called.diagnostics.map((d) => hostDiagnostic("glue", d))); return out; }
  const composition = called.composition;
  const build = scopeOf(out, "glue", text, mod, path);
  if (build) finish(out, composition, build, path, input.profile);
  return out;
}

/** @param {HostPackage} p @returns {string} the manifest's grammar path */
function entryGrammar(p) {
  const { manifest } = checkManifest(textOf(p.files[MANIFEST_PATH]) ?? "");
  return manifest?.entry.grammar ?? "";
}

/**
 * The URL of a custom element's module, named as the UI names it (`./field.js`): kit/package's `uiModulePath`,
 * relative to the UI module, the path kit/package checked against `elements`; null when the package has none.
 * @param {Pick<HostPackage, "files" | "urls">} p @param {string} module
 */
export function elementModuleUrl(p, module) {
  /** @type {any} */
  let manifest = null;
  try { manifest = JSON.parse(withoutBom(textOf(p.files[MANIFEST_PATH] ?? "") ?? "")); } catch { return null; }
  const path = uiModulePath(typeof manifest?.entry?.ui === "string" ? manifest.entry.ui : "ui.js", module);
  return path === null ? null : p.urls.get(path) ?? null;
}

/**
 * A Program file's module scope (kit/define's moduleScope), or null with its diagnostic in `out`.
 * @param {Loaded} out @param {string} source @param {string} text @param {any} mod @param {string} path
 */
function scopeOf(out, source, text, mod, path) {
  try { return moduleScope(text, mod); } catch (e) { out.diagnostics.push(loadError(source, `${path}'s top level could not be read: ${message(e)}`)); return null; }
}

/**
 * Options for compose from the loaded packages and the Program file's scope, then check and build.
 * @param {Loaded} out @param {any} composition @param {import("../../define/define.js").BuildOptions} build @param {string} path @param {string | undefined} profile
 */
function finish(out, composition, build, path, profile) {
  const missing = out.packages.filter((p) => !p.loaded.runtime).map((p) => p.name);
  if (missing.length) out.diagnostics.push(loadError("glue", `package ${missing.join(", ")} has no runtime, so the workbench cannot run`, "name a runtime module in the manifest's entry.runtime"));
  out.runtimes = out.packages.map((p) => p.loaded.runtime).filter(Boolean);
  const options = { packages: out.packages.map((p) => p.loaded), build, ...(missing.length ? {} : { runtimes: out.runtimes }), ...(profile ? { profile } : {}) };
  checkAndBuild(out, composition, options, path);
}

/**
 * Loads packages and one package's example as a one-part composition shown on the page: a preset.
 * @param {{ packages: Record<string, Record<string, string | Uint8Array>>, package: string, example: string, profile?: string }} input  `package` is the package's name
 * @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
export async function loadPreset(input, env) {
  const { out, all } = await loadPackages(input.packages, env);
  out.sourceName = input.example;
  if (!all) return out;
  const pkg = out.packages.find((p) => p.name === input.package);
  const url = pkg?.urls.get(input.example);
  if (!pkg || url === undefined) { out.diagnostics.push(loadError("preset", `package ${input.package} has no example ${input.example}`)); return out; }
  out.source = textOf(pkg.files[input.example]) ?? "";
  /** @type {any} */
  let mod;
  try { mod = await env.importUrl(url); } catch (e) { out.diagnostics.push(loadError("preset", `${input.example} did not load: ${message(e)}`)); return out; }
  const build = scopeOf(out, "preset", out.source, mod, input.example);
  if (!build) return out;
  // kit/page composes it alone: built through kit/define's run, so a build-time read of $ is answered and recorded
  const preset = examplePreset(pkg.name, mod.default, build);
  if (!preset.composition) { out.diagnostics.push(...preset.diagnostics.map((d) => hostDiagnostic("preset", { ...d, file: input.example }))); return out; }
  out.rebuild = preset.build;
  finish(out, preset.composition, build, input.example, input.profile);
  return out;
}

/**
 * Loads packages alone (no glue yet), so the page can list their examples as presets and show their diagnostics.
 * @param {Record<string, Record<string, string | Uint8Array>>} packages
 * @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
export async function loadPackagesOnly(packages, env) {
  return (await loadPackages(packages, env)).out;
}
