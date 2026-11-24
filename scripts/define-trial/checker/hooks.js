// Supplies `kit/define` to a candidate's files through Node's in-thread module hooks, appends to each example an
// export of its top-level bindings (its module scope, which the Program's lambdas resolve against), and gives every
// candidate file a per-check query string so a second check of the same directory loads it afresh.

import { registerHooks } from "node:module";
import { session } from "./session.js";
import { lineAt } from "./locate.js";
import { topLevelNames } from "../../../kit/parse/toplevel.js";
import { EXAMPLES_DIR } from "./examples.js";

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
    load(url, context, next) {
      const r = next(url, context);
      const file = session.relative(url);
      if (file === null || !file.startsWith(`${EXAMPLES_DIR}/`) || r.format !== "module" || r.source == null) return r;
      return { ...r, source: withScope(String(r.source)) };
    },
  });
}

/** Words that cannot be read as a name. */
const RESERVED = new Set(["default", "enum", "await", "yield", "let", "static", "implements", "interface", "package", "private", "protected", "public", "arguments", "eval"]);

/** The export the checker appends to each example: a function returning the file's top-level bindings. */
export const SCOPE_EXPORT = "__defineTrialScope";

/**
 * An example's text with an epilogue that hands its top-level bindings to the checker (the module scope a
 * Program's lambdas resolve their free names against). The epilogue comes last, so every line keeps its number.
 * @param {string} text
 */
export function withScope(text) {
  // The scan errs toward listing a name; one the module does not bind (or has not bound) is left out, not thrown.
  const names = topLevelNames(text).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && !RESERVED.has(n));
  // The epilogue's own local must not shadow a binding it reads.
  let out = "__scope";
  while (names.includes(out)) out += "_";
  const reads = names.map((n) => `try { ${out}.${n} = ${n}; } catch {}`).join(" ");
  return `${text}\n;export function ${SCOPE_EXPORT}() { const ${out} = {}; ${reads} return ${out}; }\n`;
}
