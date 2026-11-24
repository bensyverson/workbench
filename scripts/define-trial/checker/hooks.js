// Supplies `kit/define` to a candidate's files through Node's in-thread module hooks, and gives every
// candidate file a per-check query string so a second check of the same directory loads it afresh.

import { registerHooks } from "node:module";
import { session } from "./session.js";
import { lineAt } from "./locate.js";

export const DEFINE_SPECIFIER = "kit/define";
const DEFINE_URL = new URL("./define.js", import.meta.url).href;

/**
 * R1: a candidate file imports "kit/define" or one of the candidate's own files. The hook sees every import
 * a loaded module makes (static, dynamic, `export … from`), so this does not read the text for them.
 * @param {string} specifier @param {string | undefined} parentURL @param {string} url  what it resolved to
 */
function checkImport(specifier, parentURL, url) {
  const file = session.relative(parentURL);
  if (file === null || url.startsWith(session.dirUrl)) return;
  const text = session.sources[file] ?? "";
  const seen = session.diagnostics.filter((d) => d.code === "C006" && d.file === file && d.message.startsWith(`${file} imports '${specifier}'`)).length;
  let at = -1;
  for (let i = 0; i <= seen; i++) at = text.indexOf(specifier, at + 1);
  session.add({
    file, line: at < 0 ? 1 : lineAt(text, at), code: "C006", severity: "error",
    message: `${file} imports '${specifier}'${seen ? ` (again, #${seen + 1})` : ""}; only "${DEFINE_SPECIFIER}" and the candidate's own files may be imported.`,
    fix: `remove the import; a definition or example needs nothing from outside "${DEFINE_SPECIFIER}" (rules.md R1)`,
  });
}

let installed = false;

/** Installs the hooks once per process. */
export function installHooks() {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === DEFINE_SPECIFIER) return { url: DEFINE_URL, format: "module", shortCircuit: true };
      const r = next(specifier, context);
      checkImport(specifier, context.parentURL, r.url);
      if (session.dirUrl && r.url.startsWith(session.dirUrl) && !r.url.includes("?")) return { ...r, url: `${r.url}?run=${session.run}` };
      return r;
    },
  });
}
