// What a package's examples and refusals need from Node that kit/package leaves to the host: a Program's lambdas
// may read their module's top-level helpers, and only the module's own code can say what those are. A load hook
// appends to each such module the define trial's export of its top-level bindings (withScope), and `moduleScope`
// turns that export and the file's text into the options kit's run() takes. Both are the define trial's; this
// file only wires them to a package folder.

import { registerHooks } from "node:module";
import { withScope } from "../../define-trial/checker/hooks.js";
import { moduleScope } from "../../define-trial/checker/examples.js";
import { session as defineSession } from "../../define-trial/checker/session.js";

/** The file URLs (no query) of the modules the hook appends the scope export to. @type {Set<string>} */
let scoped = new Set();
let installed = false;

/** @param {string} url */
const bare = (url) => url.replace(/\?.*$/, "");

/** Installs the load hook once per process. */
function install() {
  if (installed) return;
  installed = true;
  registerHooks({
    load(url, context, next) {
      const r = next(url, context);
      if (!scoped.has(bare(url)) || r.format !== "module" || r.source == null) return r;
      return { ...r, source: withScope(String(r.source)) };
    },
  });
}

/**
 * Starts a check: the modules at `paths` under `dirUrl` get their scope export, and `files` is what moduleScope reads.
 * @param {string} dirUrl  the package folder as a file URL ending in /
 * @param {string[]} paths  the manifest's examples and refusals
 * @param {Record<string, string | Uint8Array>} files  the package's files; only text files are sources
 */
export function scopeModules(dirUrl, paths, files) {
  install();
  scoped = new Set(paths.map((p) => `${dirUrl}${p}`));
  defineSession.sources = /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(files).filter(([, t]) => typeof t === "string")));
  defineSession.diagnostics = [];
}

/**
 * run()'s options for an example: its module scope. A file whose top level the scan cannot read is an error with
 * the scan's own message.
 * @param {string} path @param {Record<string, unknown>} mod
 * @returns {import("../../../kit/define/define.js").BuildOptions}
 */
export function buildOptions(path, mod) {
  defineSession.diagnostics = [];
  const options = moduleScope(path, mod);
  if (options === null) throw new Error(defineSession.diagnostics[0]?.message ?? "its top-level declarations could not be read");
  return options;
}
