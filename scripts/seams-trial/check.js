// The seams relay trial's checker, as a command: `node scripts/seams-trial/check.js <dir> --role maze|particles|compose`.
// The logic is in checker/; this file parses the arguments, prints, logs and sets the exit code.
// Every invocation is appended as one JSON line to the file named by SEAMS_TRIAL_LOG, if set.

import { appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRole, CheckTargetError, ROLES } from "./checker/index.js";

/** @import { CheckResult } from "./checker/index.js" */
/** @import { Violation, Side } from "./checker/codes.js" */

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });

const SELF = relative(process.cwd(), fileURLToPath(import.meta.url)) || "check.js";
const PRIMER = `usage: node ${SELF} <dir> --role maze|particles|compose [--json]

--role maze or particles: <dir> is a package folder (wb-package.json at its root). Checks it as the package trial
does (manifest, hashes, imports, examples, UI), with the draft's ports, frames, edges and inputs (D024-D031), then
the leg's task (G1..).
--role compose: <dir> holds workbench.js beside maze/ and particles/. Checks both packages, then runs the glue
program against kit/compose and checks the composition (S...), then the task (G0..).
Prints every violation as
  <file>:<line>: <code> <message>
    from: <part>.<port>  <seam>  (<package> <version>)     (a wire's or an edge's two sides, when it has them)
    to:   <part>.<port>  <seam>  (<package> <version>)
    fix: <what to write instead>
and, for a clean composition, each wire with its conversion plan.
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: <dir> is missing.
--json prints the result as one JSON object instead.`;

/** @param {Side} s */
const sideText = (s) => (s.port ? `${s.part}.${s.port}` : s.frame ? `${s.part}.frame.${s.frame}` : s.part);
/** @param {Side} s */
const sideType = (s) => s.seam ?? (s.has ? (s.has.length ? `has ${s.has.join(", ")}` : "has none") : s.dims !== undefined ? `${s.dims}-D frame` : "");

/** @param {CheckResult} r @param {string} dirArg */
export function format(r, dirArg) {
  const out = [];
  for (const d of /** @type {Violation[]} */ (r.diagnostics)) {
    out.push(`${join(dirArg, d.file)}:${d.line}: ${d.code} ${d.message}`);
    const sides = /** @type {Array<["from" | "to", Side]>} */ ([["from", d.from], ["to", d.to]].filter(([, s]) => s));
    const w1 = Math.max(0, ...sides.map(([, s]) => sideText(s).length)), w2 = Math.max(0, ...sides.map(([, s]) => sideType(s).length));
    for (const [k, s] of sides) out.push(`  ${`${k}:`.padEnd(5)} ${sideText(s).padEnd(w1)}  ${sideType(s).padEnd(w2)}  (${s.dialect} ${s.version})`);
    out.push(`  fix: ${d.fix}`);
  }
  for (const w of r.wires ?? []) out.push(`wire ${w.from} → ${w.to}${w.convert.length ? `: ${w.convert.join("; ")}` : ", unconverted"}${w.dropped.length ? `; drops ${w.dropped.join(", ")}` : ""}`);
  out.push(r.ok ? `${dirArg}: no violations` : `${dirArg}: ${r.diagnostics.length} violation${r.diagnostics.length === 1 ? "" : "s"}`);
  return out.join("\n");
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const log = process.env.SEAMS_TRIAL_LOG;
  /** The log line of this invocation: filled in as far as the arguments get, and appended whatever the outcome. @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), dir: null, role: null, ok: false, loadError: null, diagnostics: [], files: [] };
  /** @param {number} code @param {string | null} [problem] */
  const finish = (code, problem = null) => {
    if (problem !== null) entry.loadError = problem;
    if (log) try { appendFileSync(log, JSON.stringify(entry) + "\n"); } catch (e) { console.error(`warning: cannot write SEAMS_TRIAL_LOG: ${/** @type {Error} */ (e).message}`); }
    return code;
  };
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); entry.ok = true; return finish(EXIT.ok); }
  const json = argv.includes("--json");
  const rest = argv.filter((a) => a !== "--json");
  const at = rest.indexOf("--role");
  const role = at >= 0 ? rest[at + 1] : undefined;
  const positional = rest.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
  if (role === undefined || !ROLES.includes(role)) { console.error(PRIMER); return finish(EXIT.usage, `usage: --role is one of ${ROLES.join(", ")}`); }
  entry.role = role;
  if (positional.length !== 1 || positional[0].startsWith("-")) { console.error(PRIMER); return finish(EXIT.usage, "usage: expected one <dir>"); }
  const dirArg = positional[0];
  entry.dir = resolve(dirArg);
  try {
    const r = await checkRole(dirArg, /** @type {any} */ (role));
    console.log(json ? JSON.stringify(r) : format(r, dirArg));
    Object.assign(entry, { ok: r.ok, diagnostics: r.diagnostics, files: r.files, ...(r.wires ? { wires: r.wires } : {}) });
    return finish(r.ok ? EXIT.ok : EXIT.violations);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (e instanceof CheckTargetError) { console.error(`error: ${err.message}`); return finish(EXIT.target, err.message); }
    console.error(`error: the checker itself failed: ${err.stack ?? err.message}`);
    return finish(EXIT.crash, `the checker failed: ${err.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
