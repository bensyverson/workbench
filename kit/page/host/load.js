// Loading a workbench in the page: packages (each a `{ path: text | bytes }` map) through kit/package, a glue
// program through kit/compose, or one package's example as a one-part composition (a preset). The host's own parts
// are the URLs of the modules (a blob URL in the page: kit/package's `rewriteSpecifiers` makes the specifiers
// resolve), the module scope of a Program file, and turning every diagnostic of the kit's into one shape the page
// lists. No decision is made here that the kit makes: each check, each build and each refusal is the kit's.

import { KIT_VERSION, withScope, moduleScope } from "../../define/index.js";
import { rewriteGlue, callGlue, formatDiagnostic } from "../../compose/index.js";
import { examplePreset, runTests } from "../index.js";
import { loadPackage, rewriteSpecifiers, checkManifest, textOf, elementModulePath, MANIFEST_PATH } from "../../package/index.js";
import { isDotPath } from "../../package/paths.js";

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
 * @property {{ kind: "glue", path: string } | { kind: "preset", package: string, example: string, wirePage: boolean } | null} program  what the text is, so `reloadText` can build a new one
 * @property {((part: string, params: Record<string, unknown>, more?: { args?: Record<string, unknown> }) => Record<string, any>) | null} rebuild  a preset's rebuild for a build-time param edit (kit/page's examplePreset), which createRun takes as `build`; for a glue, its part built again with argument overrides (callGlue's `args`), a Grip's or a Control's preview; null when nothing built
 */

/** @returns {Loaded} */
const nothing = () => ({ packages: [], diagnostics: [], plan: [], composition: null, composed: null, runtimes: [], source: "", sourceName: "", options: {}, program: null, rebuild: null });

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
  out.program = { kind: "glue", path: input.glue.path };
  if (!all) return out;
  return glueFrom(out, input.glue, env, input.profile);
}

/**
 * The glue's text built on packages already loaded, into `out`.
 * @param {Loaded} out @param {{ path: string, text: string }} glue @param {LoadEnv} env @param {string | undefined} profile
 * @returns {Promise<Loaded>}
 */
async function glueFrom(out, glue, env, profile) {
  const { path, text } = glue;
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
  if (build) finish(out, composition, build, path, profile);
  // a Grip's or a Control's preview of a glue part's argument: the glue called again with the override
  if (out.composed) out.rebuild = (part, _params, more = {}) => glueRebuild(mod.default, path, out.options, part, more.args);
  return out;
}

/**
 * One part of a glue built again with argument overrides (kit/compose's `callGlue(…, { args })`), for a preview: the
 * part's record, or a throw naming what refused it. A glue has no params, so `params` is not read.
 * @param {unknown} exported @param {string} path @param {Record<string, any>} options @param {string} part @param {Record<string, unknown>} [args]
 */
function glueRebuild(exported, path, options, part, args) {
  const called = callGlue(exported, path, args ? { args } : {});
  if (!called.composition) throw new Error(`the glue did not build with ${JSON.stringify(args)}: ${called.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`);
  const record = called.composition.build(options).parts.find((/** @type {any} */ p) => p.name === part)?.record;
  if (!record) throw new Error(`the glue has no part ${part}`);
  return record;
}

/** @param {HostPackage} p @returns {string} the manifest's grammar path */
function entryGrammar(p) {
  const { manifest } = checkManifest(textOf(p.files[MANIFEST_PATH]) ?? "");
  return manifest?.entry.grammar ?? "";
}

/**
 * The URL of a custom element's module, named as the UI names it (`./field.js`): kit/package's `elementModulePath`
 * decides the package path (and reports a manifest it cannot read); the host only looks the path up. A null url is a
 * package without that module (or a module that leaves it).
 * @param {Pick<HostPackage, "files" | "urls">} p @param {string} module
 * @returns {{ url: string | null, diagnostics: import("../../package/package.js").PackageDiagnostic[] }}
 */
export function elementModuleUrl(p, module) {
  const { path, diagnostics } = elementModulePath(p.files, module);
  return { url: path === null ? null : p.urls.get(path) ?? null, diagnostics };
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
 * @param {{ packages: Record<string, Record<string, string | Uint8Array>>, package: string, example: string, profile?: string, wirePage?: boolean }} input  `package` is the package's name; `wirePage: false` leaves the page's controls unwired, as a test's run needs (Open on a failed test)
 * @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
export async function loadPreset(input, env) {
  const { out, all } = await loadPackages(input.packages, env);
  out.sourceName = input.example;
  out.program = { kind: "preset", package: input.package, example: input.example, wirePage: input.wirePage ?? true };
  if (!all) return out;
  const pkg = out.packages.find((p) => p.name === input.package);
  const url = pkg?.urls.get(input.example);
  if (!pkg || url === undefined) { out.diagnostics.push(loadError("preset", `package ${input.package} has no example ${input.example}`)); return out; }
  out.source = textOf(pkg.files[input.example]) ?? "";
  return presetFrom(out, pkg, url, input.example, input.wirePage ?? true, input.profile, env);
}

/**
 * A preset's example built from its module's URL on packages already loaded, into `out` (whose `source` is its text).
 * @param {Loaded} out @param {HostPackage} pkg @param {string} url @param {string} example @param {boolean} wirePage @param {string | undefined} profile @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
async function presetFrom(out, pkg, url, example, wirePage, profile, env) {
  const input = { example, wirePage, profile };
  /** @type {any} */
  let mod;
  try { mod = await env.importUrl(url); } catch (e) { out.diagnostics.push(loadError("preset", `${input.example} did not load: ${message(e)}`)); return out; }
  const build = scopeOf(out, "preset", out.source, mod, input.example);
  if (!build) return out;
  // kit/page composes it alone: built through kit/define's run, so a build-time read of $ is answered and recorded
  // its declared Controls wired by name to the inputs they play (declared Controls, 2026-11-27)
  const preset = examplePreset(pkg.name, mod.default, build, { ui: pkg.loaded.ui ?? null, wirePage: input.wirePage });
  if (!preset.composition) { out.diagnostics.push(...preset.diagnostics.map((d) => hostDiagnostic("preset", { ...d, file: input.example }))); return out; }
  out.rebuild = preset.build;
  finish(out, preset.composition, build, input.example, input.profile);
  return out;
}

/**
 * A new text of a loaded Program (the editor's Apply, a write-back, an undo) built on the packages already loaded,
 * which are not fetched or imported again: a glue's text through kit/compose's `rewriteGlue` and `callGlue`, a preset's
 * example with its package's specifiers rewritten (kit/package's `rewriteSpecifiers`, to the modules already loaded)
 * and its module scope. The result is a Loaded whose `composed` is null when the text does not build, with why.
 * @param {Loaded} loaded @param {string} text @param {LoadEnv} env
 * @returns {Promise<Loaded>}
 */
export async function reloadText(loaded, text, env) {
  const out = { ...nothing(), packages: loaded.packages, source: text, sourceName: loaded.sourceName, program: loaded.program };
  const profile = loaded.options.profile;
  const program = loaded.program;
  if (!program) { out.diagnostics.push(loadError("editor", "nothing is loaded, so there is no Program to build the text of")); return out; }
  if (program.kind === "glue") return glueFrom(out, { path: program.path, text }, env, profile);
  const pkg = loaded.packages.find((p) => p.name === program.package);
  if (!pkg) { out.diagnostics.push(loadError("editor", `package ${program.package} is not loaded`)); return out; }
  const rewritten = rewriteSpecifiers({ ...pkg.files, [program.example]: text }, (p) => /** @type {string} */ (pkg.urls.get(p)), env.urls.define);
  if (rewritten.diagnostics.length) { out.diagnostics.push(...rewritten.diagnostics.map((d) => hostDiagnostic(`package ${pkg.label}`, d))); return out; }
  const mine = [...rewritten.modules].find((m) => m.path === program.example);
  if (!mine) { out.diagnostics.push(loadError("editor", `${program.example} is not a module of package ${pkg.name}`)); return out; }
  return presetFrom(out, pkg, env.makeUrl(withScope(mine.text)), program.example, program.wirePage, profile, env);
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

/** The loaded packages that have manifest tests, with them: the packages a Tests row is for. Tests are optional, so a package with none has no row. @param {Loaded} loaded */
export function packagesWithTests(loaded) {
  return loaded.packages.filter((p) => (p.loaded.tests ?? []).length).map((p) => ({ name: p.name, tests: /** @type {any[]} */ (p.loaded.tests) }));
}

/**
 * Runs every loaded package's manifest tests (kit/page's runTests), one package at a time, each example imported from
 * the package's own module URLs with its module scope. `options` are runTests': signal, onProgress, yieldFn, budgetMs.
 * @param {Loaded} loaded @param {LoadEnv} env @param {{ signal?: AbortSignal, onProgress?: (fraction: number) => void, budgetMs?: number, yieldFn?: () => Promise<void> }} [options]
 * @returns {Promise<Array<{ package: string, results: any[], diagnostics: any[], cancelled?: true }>>}
 */
export async function runLoadedTests(loaded, env, options = {}) {
  /** @type {Array<{ package: string, results: any[], diagnostics: any[], cancelled?: true }>} */
  const out = [];
  const withTests = packagesWithTests(loaded);
  for (const [i, { name }] of withTests.entries()) {
    const pkg = /** @type {HostPackage} */ (loaded.packages.find((p) => p.name === name));
    const r = await runTests(pkg.loaded, {
      importModule: (path) => env.importUrl(/** @type {string} */ (pkg.urls.get(path))),
      buildOptions: (path, mod) => moduleScope(textOf(pkg.files[path]) ?? "", mod),
      ...options,
      ...(options.onProgress ? { onProgress: (/** @type {number} */ f) => options.onProgress?.((i + f) / withTests.length) } : {}),
    });
    out.push({ package: name, ...r });
    if (r.cancelled) break;
  }
  return out;
}
