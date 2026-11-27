// Where a workbench's files come from: the URL query, a fetch of each package's listed files, and an upload (a folder
// or a bundle). Each returns the `{ path: text | bytes }` maps kit/package works on, plus a host diagnostic for
// anything it could not get. A `.js` file and the manifest are text; every other file is bytes (a PNG must be).

import { readBundle, textOf, MANIFEST_PATH } from "../../package/index.js";
import { parseModule } from "../../parse/module.js";
import { hostDiagnostic } from "./load.js";

/** @typedef {import("./load.js").HostDiagnostic} HostDiagnostic */
/** @typedef {Record<string, string | Uint8Array>} Files */

/** Whether a file is kept as text. @param {string} path */
export const isTextPath = (path) => path.endsWith(".js") || path === MANIFEST_PATH;

/** @param {string} path @param {ArrayBuffer} buffer @returns {string | Uint8Array} */
export function contentOf(path, buffer) {
  const bytes = new Uint8Array(buffer);
  return isTextPath(path) ? new TextDecoder().decode(bytes) : bytes;
}

/**
 * The workbench the URL asks for: `?workbench=<glue path>&packages=<dir>,<dir>&profile=<name>&preset=<package>/<example>`.
 * @param {string} search
 * @returns {{ workbench: string | null, packages: string[], profile: string | null, preset: string | null }}
 */
export function parseQuery(search) {
  const q = new URLSearchParams(search);
  const list = (q.get("packages") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { workbench: q.get("workbench"), packages: list, profile: q.get("profile"), preset: q.get("preset") };
}

/**
 * The package names a glue imports (every import that is not `kit/…`), which are folders beside it when the URL
 * lists none. A glue that does not parse names none: loading reports it.
 * @param {string} text @returns {string[]}
 */
export function importedPackages(text) {
  try {
    return /** @type {any} */ (parseModule(text)).body.flatMap((/** @type {any} */ n) => (n.type === "ImportDeclaration" && !String(n.source.value).startsWith("kit/") ? [String(n.source.value)] : []));
  } catch { return []; }
}

/** `dir`'s last segment: a package's label. @param {string} url */
export const labelOf = (url) => url.replace(/\/+$/, "").split("/").pop() ?? url;

/**
 * Fetches `<dir>/wb-package.json`, then each file it lists. A file that cannot be had is a diagnostic and the package
 * is still returned, so kit/package then also reports it (K004).
 * @param {string} dir  an absolute URL @param {(url: string) => Promise<Response>} fetchFn
 * @returns {Promise<{ label: string, files: Files, diagnostics: HostDiagnostic[] }>}
 */
export async function fetchPackage(dir, fetchFn) {
  const label = labelOf(dir);
  const base = dir.replace(/\/+$/, "") + "/";
  /** @type {Files} */
  const files = {};
  /** @type {HostDiagnostic[]} */
  const diagnostics = [];
  /** @param {string} path */
  const get = async (path) => {
    try {
      const r = await fetchFn(base + path);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      files[path] = contentOf(path, await r.arrayBuffer());
    } catch (e) { diagnostics.push(hostDiagnostic(`package ${label}`, { code: "LOAD", severity: "error", message: `could not fetch ${base}${path}: ${e instanceof Error ? e.message : e}` })); }
  };
  await get(MANIFEST_PATH);
  /** @type {string[]} */
  let listed = [];
  try { listed = Object.keys(JSON.parse(textOf(files[MANIFEST_PATH] ?? "") ?? "").files ?? {}); } catch { /* kit/package reports the manifest */ }
  await Promise.all(listed.filter((p) => typeof p === "string").map(get));
  return { label, files, diagnostics };
}

/**
 * Fetches a glue's text. @param {string} url @param {(url: string) => Promise<Response>} fetchFn
 * @returns {Promise<{ glue: { path: string, text: string } | null, diagnostics: HostDiagnostic[] }>}
 */
export async function fetchGlue(url, fetchFn) {
  try {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { glue: { path: labelOf(url), text: await r.text() }, diagnostics: [] };
  } catch (e) { return { glue: null, diagnostics: [hostDiagnostic("glue", { code: "LOAD", severity: "error", message: `could not fetch ${url}: ${e instanceof Error ? e.message : e}` })] }; }
}

/**
 * An uploaded folder's files grouped into packages (each folder holding a `wb-package.json`) and the glue: the
 * `.js` files outside every package, `workbench.js` when there are several.
 * @param {{ path: string, content: string | Uint8Array }[]} entries  paths as a folder picker gives them (`root/maze/wb-package.json`)
 * @returns {{ packages: Record<string, Files>, glue: { path: string, text: string } | null, glues: string[] }}
 */
export function groupUpload(entries) {
  const live = entries.filter((e) => !e.path.split("/").some((s) => s.startsWith(".")));
  const roots = live.filter((e) => e.path === MANIFEST_PATH || e.path.endsWith(`/${MANIFEST_PATH}`)).map((e) => e.path.slice(0, e.path.length - MANIFEST_PATH.length));
  /** @type {Record<string, Files>} */
  const packages = {};
  for (const root of roots) {
    const label = labelOf(root) || "package";
    packages[label] = Object.fromEntries(live.filter((e) => e.path.startsWith(root)).map((e) => [e.path.slice(root.length), e.content]));
  }
  const loose = live.filter((e) => e.path.endsWith(".js") && !roots.some((r) => e.path.startsWith(r)));
  const chosen = loose.length === 1 ? loose[0] : loose.find((e) => labelOf(e.path) === "workbench.js") ?? null;
  return {
    packages,
    glue: chosen ? { path: labelOf(chosen.path), text: String(textOf(chosen.content) ?? "") } : null,
    glues: loose.map((e) => e.path),
  };
}

/**
 * A bundle file's package: kit/package's `readBundle`, labeled by its manifest's name.
 * @param {string} text
 * @returns {{ label: string, files: Files | null, diagnostics: HostDiagnostic[] }}
 */
export function packageFromBundle(text) {
  const r = readBundle(text);
  if (!r.files) return { label: "bundle", files: null, diagnostics: r.diagnostics.map((d) => hostDiagnostic("bundle", d)) };
  let label = "bundle";
  try { label = JSON.parse(textOf(r.files[MANIFEST_PATH] ?? "") ?? "").name ?? label; } catch { /* the load reports it */ }
  return { label, files: r.files, diagnostics: [] };
}
