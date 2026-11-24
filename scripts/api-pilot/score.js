// The API pilot's scorer, as a command: `node scripts/api-pilot/score.js <hand-in dir> [<hidden dir>]`.
// The logic is in score/; this file prints one line per hidden program and sets the exit code.

import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { score } from "./score/index.js";

const HIDDEN = join(dirname(fileURLToPath(import.meta.url)), "hidden");
const USAGE = `usage: node scripts/api-pilot/score.js <hand-in dir> [<hidden dir>]

Runs the hand-in's budget.dialect.js and budget.grammar.js over every hidden program (default: ${HIDDEN}).
An accept program passes with no error in its file; a reject program passes with at least one.
Exit 0: every program passed. 1: some did not. 2: bad invocation.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); return 0; }
  if (argv.length < 1 || argv.length > 2 || argv.some((a) => a.startsWith("-"))) { console.error(USAGE); return 2; }
  const r = await score(argv[0], argv[1] ?? HIDDEN);
  if (!r.definitions.ok) console.log(`definitions: FAIL ${r.definitions.codes.join(",")}`);
  for (const x of r.results) console.log(`${`${x.kind}/${x.file}`.padEnd(18)} ${x.pass ? "pass" : "FAIL"}${x.codes.length ? `  ${x.codes.join(",")}` : ""}`);
  console.log(`accept ${r.accept.pass}/${r.accept.of}, reject ${r.reject.pass}/${r.reject.of}`);
  return r.results.every((x) => x.pass) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
