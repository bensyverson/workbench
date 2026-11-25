// The Definition API trial's checker, as a command: `node scripts/define-trial/check.js <dir>`.
// The logic is in checker/; this file parses the arguments, prints, logs and sets the exit code.
// Every invocation is appended as one JSON line to the file named by DEFINE_TRIAL_LOG, if set.

import { appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDir, CheckTargetError, DIALECT_FILE, GRAMMAR_FILE, EXAMPLES_DIR, definitionFiles } from "./checker/index.js";

/** @import { CheckResult } from "./checker/index.js" */

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, target: 4 });

const SELF = relative(process.cwd(), fileURLToPath(import.meta.url)) || "check.js";
const PRIMER = `usage: node ${SELF} <dir> [--json] [--lang <name>] [--effects]

Checks a Definition API trial hand-in against docs/rules.md: loads <dir>/${DIALECT_FILE}, <dir>/${GRAMMAR_FILE}
and <dir>/${EXAMPLES_DIR}/*.js with the real kit/define, builds each example's Program, a function of its
params, with kit/define's run() and lowers it, and prints every violation as
  <file>:<line>: <code> <message>
    fix: <what to write instead>
D… codes are about the definition files, B… about a Program (the builder, construct state, conventions),
L…, P… and S… about a lambda's body (lowering), C… the checker's own rules; rules.md lists them all.
Exit 0: no violations. 1: violations. 2: bad invocation. 4: <dir> or a definition file is missing.
--json prints the result as one JSON object instead.
--lang <name> checks <dir>/<name>.dialect.js and <name>.grammar.js instead (default: data).
--effects runs trial 4's rules (docs/rules-effects.md): an example whose first line is // REFUSED: <code>
  must fail (C008 if it checks clean), and what it failed with is printed beside its declared code. The
  per-slot effects themselves (docs/api-effects.md: D012, D021, D022, L004, L013, L017) are kit/define's,
  checked with or without the flag.`;

/**
 * The text the author reads.
 * @param {CheckResult} r
 * @param {string} dirArg  the directory as given, so the printed paths open from the same place
 */
export function format(r, dirArg) {
  const out = [];
  for (const d of r.diagnostics) out.push(`${join(dirArg, d.file)}:${d.line}: ${d.code} ${d.message}`, `  fix: ${d.fix}`, ...(d.tip ? [`  tip: ${d.tip}`] : []));
  const examples = Object.keys(r.files).filter((f) => f.startsWith(`${EXAMPLES_DIR}/`)).length;
  const errors = r.diagnostics.filter((d) => d.severity === "error").length;
  out.push(r.ok ? `${dirArg}: no violations (the definitions and ${examples} example${examples === 1 ? "" : "s"} checked)` : `${dirArg}: ${errors} violation${errors === 1 ? "" : "s"}`);
  return out.join("\n");
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); return EXIT.ok; }
  const json = argv.includes("--json");
  const effects = argv.includes("--effects");
  let rest = argv.filter((a) => a !== "--json" && a !== "--effects");
  let lang = "data";
  const at = rest.indexOf("--lang");
  if (at >= 0) {
    lang = rest[at + 1] ?? "";
    try { definitionFiles(lang); } catch (e) { console.error(`error: --lang: ${/** @type {Error} */ (e).message}\n\n${PRIMER}`); return EXIT.usage; }
    rest = [...rest.slice(0, at), ...rest.slice(at + 2)];
  }
  if (rest.length !== 1 || rest[0].startsWith("-")) { console.error(PRIMER); return EXIT.usage; }
  const dirArg = rest[0];
  const log = process.env.DEFINE_TRIAL_LOG;
  /** @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), dir: resolve(dirArg) };
  let code;
  try {
    const r = await checkDir(dirArg, { lang, effects });
    console.log(json ? JSON.stringify(r) : format(r, dirArg));
    Object.assign(entry, { ok: r.ok, loadError: null, diagnostics: r.diagnostics, files: r.files });
    code = r.ok ? EXIT.ok : EXIT.violations;
  } catch (e) {
    if (!(e instanceof CheckTargetError)) throw e;
    console.error(`error: ${e.message}`);
    Object.assign(entry, { ok: false, loadError: e.message, diagnostics: [], files: {} });
    code = EXIT.target;
  }
  if (log) appendFileSync(log, JSON.stringify(entry) + "\n");
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
