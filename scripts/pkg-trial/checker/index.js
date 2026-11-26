// The package trial checker's library: reads a package folder into a { path: text } map, runs kit/package's
// loadPackage over it with a Node importModule, and runs the defineUI checks when the package has a UI.
// `kit/define` is supplied to the package's files by the UI trial's module hooks (it records defineUI calls);
// the package's files load in this process with your privileges, so this is not a sandbox (README).

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KIT_VERSION } from "../../../kit/define/index.js";
import { checkManifest, loadPackage, rewriteSpecifiers, MANIFEST_PATH } from "../../../kit/package/index.js";
import { installHooks } from "../../ui-trial/checker/hooks.js";
import { session, begin } from "../../ui-trial/checker/session.js";
import { checkDir } from "../../ui-trial/checker/index.js";
import { readPackageDir, PackageDirError } from "../../pkg/dir.js";

/** @typedef {{ file: string, line: number, code: string, severity: "error", message: string, fix: string }} Violation */
/** @typedef {{ ok: boolean, diagnostics: Violation[], files: string[] }} CheckResult */

/** A package folder that cannot be checked at all: it does not exist or is not a directory. */
export class CheckTargetError extends Error {}

/**
 * Where a load failure points: the first stack frame inside the package's directory, as `file:line`, else null.
 * @param {unknown} stack @param {string} dirUrl
 */
function loadSite(stack, dirUrl) {
  for (const m of String(stack ?? "").matchAll(/(file:\/\/[^\s()]*?)(?:\?run=\d+)?:(\d+)(?::\d+)?(?=[\s)]|$)/g)) {
    if (m[1].startsWith(dirUrl)) return { file: decodeURIComponent(m[1].slice(dirUrl.length)), line: Number(m[2]) };
  }
  return null;
}

/**
 * Checks the package in `dir`.
 * @param {string} dir
 * @returns {Promise<CheckResult>}
 */
export async function checkPackageDir(dir) {
  const root = resolve(dir);
  /** @type {Record<string, string>} */
  let files;
  try { files = readPackageDir(root); } catch (e) {
    if (e instanceof PackageDirError) throw new CheckTargetError(e.message);
    throw e;
  }
  installHooks();
  // Node resolves through symlinks (macOS tmp is /private/var), so the hooks compare against the real path.
  const dirUrl = pathToFileURL(realpathSync(root)).href + "/";
  begin(dirUrl);
  session.moduleText = (path) => (Object.hasOwn(files, path.replace(/^\.\//, "")) ? files[path.replace(/^\.\//, "")] : null);
  /** The site of the last import failure, by path, so a K011 can say where it threw. @type {Map<string, { file: string, line: number }>} */
  const sites = new Map();
  const loaded = await loadPackage(files, {
    kitVersion: KIT_VERSION,
    async importModule(path) {
      try { return await import(`${dirUrl}${path}?run=${session.run}`); } catch (e) {
        const err = /** @type {Error & { problems?: Array<{ code: string, message: string }> }} */ (e);
        const detail = err.problems?.length ? err.problems.map((p) => `${p.code} ${p.message}`).join("; ") : err.message;
        const site = loadSite(err.stack, dirUrl);
        if (site) sites.set(path, site);
        throw new Error(detail);
      }
    },
  });
  /** @type {Violation[]} */
  const diagnostics = loaded.diagnostics.map((d) => {
    const site = d.code === "K011" && d.file !== undefined ? sites.get(d.file) : undefined;
    return { file: site?.file ?? d.file ?? MANIFEST_PATH, line: site?.line ?? d.line ?? 1, code: d.code, severity: "error", message: d.message, fix: d.fix };
  });
  const manifest = checkManifest(files[MANIFEST_PATH] ?? "").manifest;
  // The package is sound (it loaded, or an entry was only the wrong kind of value): run the UI checks and the upload check.
  const sound = manifest !== null && diagnostics.every((d) => d.code === "K008");
  if (sound) {
    const ui = manifest.entry.ui;
    if (ui !== undefined) {
      const ur = await checkDir(root, { lang: manifest.name, files: { ui, grammar: manifest.entry.grammar } });
      if (ur.diagnostics.length) {
        // The kit's refusal of the UI already says what is wrong, with a line; the K… for the same file would repeat it.
        for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i].file === ui) diagnostics.splice(i, 1);
        diagnostics.push(...ur.diagnostics);
      }
    }
    if (!diagnostics.length) for (const d of rewriteSpecifiers(files, () => "", "").diagnostics) diagnostics.push({ file: d.file ?? MANIFEST_PATH, line: d.line ?? 1, code: d.code, severity: "error", message: d.message, fix: d.fix });
  }
  diagnostics.sort((x, y) => (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1));
  return { ok: diagnostics.length === 0, diagnostics, files: Object.keys(files) };
}
