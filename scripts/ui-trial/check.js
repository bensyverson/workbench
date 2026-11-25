// The UI trial's checker, as a command: `node scripts/ui-trial/check.js <dir> --lang <name>`.
// The logic is in checker/; this file parses the arguments, prints, logs and sets the exit code.
// Every invocation is appended as one JSON line to the file named by UI_TRIAL_LOG, if set.

import { appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDir, CheckTargetError, packageFiles } from "./checker/index.js";

/** @import { CheckResult } from "./checker/index.js" */

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });

const SELF = relative(process.cwd(), fileURLToPath(import.meta.url)) || "check.js";
const PRIMER = `usage: node ${SELF} <dir> --lang <name> [--json]

Checks a UI trial hand-in against docs/rules.md: loads <dir>/<name>.ui.js (which imports the package's own
<name>.grammar.js) with the real kit/define plus a recording defineUI, and judges the declaration against
docs/ui-draft.md. Prints every violation as
  <file>:<line>: <code> <message>
    fix: <what to write instead>
U… codes are the draft's (docs/ui-draft.md, "Codes"); C001, C006 and LOAD are the checker's (docs/rules.md).
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: <dir>, the UI file or the Grammar file is missing.
--json prints the result as one JSON object instead.`;

/** @param {CheckResult} r @param {string} dirArg */
export function format(r, dirArg) {
  const out = [];
  for (const d of r.diagnostics) out.push(`${join(dirArg, d.file)}:${d.line}: ${d.code} ${d.message}`, `  fix: ${d.fix}`);
  out.push(r.ok ? `${dirArg}: no violations` : `${dirArg}: ${r.diagnostics.length} violation${r.diagnostics.length === 1 ? "" : "s"}`);
  return out.join("\n");
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const log = process.env.UI_TRIAL_LOG;
  /** The log line of this invocation: filled in as far as the arguments get, and appended whatever the outcome. @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), dir: null, lang: null, ok: false, loadError: null, diagnostics: [], files: {} };
  /** @param {number} code @param {string | null} [problem] */
  const finish = (code, problem = null) => {
    if (problem !== null) entry.loadError = problem;
    if (log) try { appendFileSync(log, JSON.stringify(entry) + "\n"); } catch (e) { console.error(`warning: cannot write UI_TRIAL_LOG: ${/** @type {Error} */ (e).message}`); }
    return code;
  };
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); entry.ok = true; return finish(EXIT.ok); }
  const json = argv.includes("--json");
  let rest = argv.filter((a) => a !== "--json");
  const at = rest.indexOf("--lang");
  if (at < 0) { console.error(PRIMER); return finish(EXIT.usage, "usage: no --lang"); }
  const lang = rest[at + 1] ?? "";
  entry.lang = lang;
  try { packageFiles(lang); } catch (e) { const m = /** @type {Error} */ (e).message; console.error(`error: --lang: ${m}\n\n${PRIMER}`); return finish(EXIT.usage, `usage: --lang: ${m}`); }
  rest = [...rest.slice(0, at), ...rest.slice(at + 2)];
  if (rest.length !== 1 || rest[0].startsWith("-")) { console.error(PRIMER); return finish(EXIT.usage, "usage: expected one <dir>"); }
  const dirArg = rest[0];
  entry.dir = resolve(dirArg);
  try {
    const r = await checkDir(dirArg, { lang });
    console.log(json ? JSON.stringify(r) : format(r, dirArg));
    Object.assign(entry, { ok: r.ok, diagnostics: r.diagnostics, files: r.files });
    return finish(r.ok ? EXIT.ok : EXIT.violations);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (e instanceof CheckTargetError) { console.error(`error: ${err.message}`); return finish(EXIT.target, err.message); }
    console.error(`error: the checker itself failed: ${err.stack ?? err.message}`);
    return finish(EXIT.crash, `the checker failed: ${err.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
