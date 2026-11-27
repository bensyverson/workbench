// The upload path: a `blob:` module cannot resolve `./x.js` (the M0 package probe, Safari 27.2), so each module's
// relative and `kit/define` specifiers are replaced by the URL of the module they name, leaves first. The blob
// creation is the host's; this is a pure function over text.

import { diag } from "./codes.js";
import { scanImports, KIT_SPECIFIER } from "./imports.js";
import { isModulePath } from "./paths.js";
import { textOf } from "./content.js";

/**
 * The package's .js files as modules in dependency order. `modules` is a generator: for each file it calls
 * `urlFor` for the file's dependencies, so the host creates each blob URL (and records it for `urlFor`) before
 * asking for the next module. A cycle or an import a package may not make is a diagnostic, and `modules` is then empty.
 * @param {import("./package.js").PackageFiles} files  a module given as bytes is read as UTF-8 (checkPackage refuses one that is not)
 * @param {(path: string) => string} urlFor  the URL of an already-yielded module
 * @param {string} kitUrl  the URL of kit/define
 * @returns {{ diagnostics: import("./package.js").PackageDiagnostic[], modules: Generator<{ path: string, text: string }> }}
 */
export function rewriteSpecifiers(files, urlFor, kitUrl) {
  const js = Object.keys(files).filter(isModulePath).sort();
  /** @type {Map<string, ReturnType<typeof scanImports>>} */
  const scans = new Map();
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const diagnostics = [];
  for (const p of js) { const s = scanImports(p, textOf(files[p]) ?? "", Object.keys(files)); scans.set(p, s); diagnostics.push(...s.diagnostics); }
  /** @type {string[]} */
  const order = [];
  const done = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @param {string} p */
  const visit = (p) => {
    if (done.has(p)) return;
    const at = stack.indexOf(p);
    if (at >= 0) {
      const cycle = [...stack.slice(at), p];
      diagnostics.push(diag("K009", `${cycle.join(" imports ")}: modules that import each other cannot be given blob: URLs`, `break the cycle: move what ${p} shares into a file neither of them imports each other through`, p));
      done.add(p);
      return;
    }
    stack.push(p);
    for (const i of /** @type {NonNullable<ReturnType<typeof scans.get>>} */ (scans.get(p)).imports) if (i.resolved !== null && i.resolved !== KIT_SPECIFIER && scans.has(i.resolved)) visit(i.resolved);
    stack.pop();
    if (!done.has(p)) { done.add(p); order.push(p); }
  };
  for (const p of js) visit(p);
  if (diagnostics.length) return { diagnostics, modules: (function* () {})() };
  return {
    diagnostics,
    modules: (function* () {
      for (const path of order) {
        let text = textOf(files[path]) ?? "";
        const imports = /** @type {NonNullable<ReturnType<typeof scans.get>>} */ (scans.get(path)).imports;
        for (const i of [...imports].sort((a, b) => b.start - a.start)) {
          const url = i.resolved === KIT_SPECIFIER ? kitUrl : urlFor(/** @type {string} */ (i.resolved));
          text = text.slice(0, i.start) + url + text.slice(i.end);
        }
        yield { path, text };
      }
    })(),
  };
}
