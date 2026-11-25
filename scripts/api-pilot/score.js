// The API pilot's scorer, as a command: `node scripts/api-pilot/score.js <hand-in dir> [<hidden dir>]`.
// The logic is in score/; this file prints one line per hidden program and sets the exit code.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { score, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, NOT_REFUSALS } from "./score/index.js";

const HIDDEN = join(dirname(fileURLToPath(import.meta.url)), "hidden");
const USAGE = `usage: node scripts/api-pilot/score.js <hand-in dir> [<hidden dir>] [--timeout <seconds>]

Runs the hand-in's budget.dialect.js and budget.grammar.js over every hidden program (default: ${HIDDEN}).
An accept program passes with no error in its file; a reject program passes with at least one that is not
${NOT_REFUSALS.join(", ")} (the candidate's own code failing), and a "warning:" line says when none is a code its header
declares; the tally counts those too, as "(n/m with a declared code)", but they do not change pass or the exit code.
The definitions run in a child process with a timeout (default ${DEFAULT_TIMEOUT_MS / 1000} s, at most ${MAX_TIMEOUT_MS / 1000}); one that
exits, loops or crashes fails every program.
Exit 0: every program passed, with at least one of each kind. 1: some did not, or a kind had none. 2: bad invocation
or a hidden dir without accept/ and reject/.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); return 0; }
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const t = argv.indexOf("--timeout");
  if (t >= 0) {
    const secs = Number(argv[t + 1]);
    if (!(secs > 0 && secs * 1000 <= MAX_TIMEOUT_MS)) { console.error(`--timeout takes a number of seconds above 0 and at most ${MAX_TIMEOUT_MS / 1000}\n${USAGE}`); return 2; }
    timeoutMs = secs * 1000;
    argv = argv.filter((_, i) => i !== t && i !== t + 1);
  }
  if (argv.length < 1 || argv.length > 2 || argv.some((a) => a.startsWith("-"))) { console.error(USAGE); return 2; }
  const hidden = argv[1] ?? HIDDEN;
  const missing = ["accept", "reject"].filter((k) => !existsSync(join(hidden, k)));
  if (missing.length) { console.error(`${hidden} has no ${missing.map((k) => `${k}/`).join(" or ")}`); return 2; }
  const r = await score(argv[0], hidden, { timeoutMs });
  if (!r.definitions.ok) console.log(`definitions: FAIL ${r.definitions.codes.join(",")}`);
  for (const x of r.results) console.log(`${`${x.kind}/${x.file}`.padEnd(18)} ${x.pass ? "pass" : "FAIL"}${x.codes.length ? `  ${x.codes.join(",")}` : ""}`);
  for (const w of r.warnings) console.log(`warning: ${w}`);
  console.log(`accept ${r.accept.pass}/${r.accept.of}, reject ${r.reject.pass}/${r.reject.of} (${r.declared.pass}/${r.declared.of} with a declared code)`);
  const none = ["accept", "reject"].filter((k) => r[/** @type {"accept" | "reject"} */ (k)].of === 0);
  for (const k of none) console.error(`no ${k} programs were scored`);
  return r.definitions.ok && none.length === 0 && r.results.every((x) => x.pass) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
