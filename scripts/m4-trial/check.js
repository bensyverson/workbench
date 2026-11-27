// The M4 trial's checker, as a command:
//   node scripts/m4-trial/check.js --role game|score <package dir>
//   node scripts/m4-trial/check.js <leg dir> --role compose --given <game package> --given <score package>
//   node scripts/m4-trial/check.js <leg dir> --role layer --given <game package> --given <score package>  (the layer leg)
// The logic is in checker/; this file parses the arguments, prints, logs and sets the exit code. Every invocation is
// appended as one JSON line to the file named by M4_TRIAL_LOG, if set. The stack of a checker failure goes only to the
// log, so a blind leg sees no repository paths.

import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkAuthor, checkCompose, CheckTargetError, ROLES } from "./checker/legs.js";
import { checkLayerCompose } from "./checker/layer-leg.js";

const ALL_ROLES = [...ROLES, "layer"];

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });

const PRIMER = `usage: check.sh <package folder>            (an author leg)
       check.sh                             (the compose leg, and the layer dogfood's)

Loads the hand-in as the workbench page does, builds it and plays it on the page with a stub canvas. Prints every
problem as
  <file>:<line>: <code> <message>
    fix: <what to do>
The layer leg's notes show each layer as the kit made it: its seam, its page box and each input's conversion.
K… are kit/package's, S… kit/compose's, H… kit/page's, N… kit/run's, LOAD the page host's, T… this trial's.
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: the folder is missing.`;

/** @param {string[]} argv */
function parse(argv) {
  /** @type {string[]} */
  const rest = [];
  /** @type {string[]} */
  const given = [];
  let role;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--role") role = argv[++i];
    else if (argv[i] === "--given") given.push(argv[++i]);
    else rest.push(argv[i]);
  }
  if (!role || !ALL_ROLES.includes(role) || rest.length !== 1 || rest[0].startsWith("-")) return null;
  if (role === "compose" || role === "layer" ? given.length !== 2 || given.some((g) => !g) : given.length) return null;
  return { role, dir: rest[0], given };
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const log = process.env.M4_TRIAL_LOG;
  /** @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), role: null, dir: null, ok: false, problem: null, diagnostics: [] };
  /** @param {number} code @param {string | null} [problem] */
  const finish = (code, problem = null) => {
    entry.problem = problem;
    if (log) try { appendFileSync(log, JSON.stringify(entry) + "\n"); } catch (e) { console.error(`warning: cannot write the log: ${/** @type {Error} */ (e).message}`); }
    return code;
  };
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); entry.ok = true; return finish(EXIT.ok); }
  const args = parse(argv);
  if (!args) { console.error(PRIMER); return finish(EXIT.usage, `usage: ${argv.join(" ")}`); }
  entry.role = args.role;
  entry.dir = resolve(args.dir);
  try {
    const r = args.role === "layer" ? await checkLayerCompose(args.dir, args.given) : args.role === "compose" ? await checkCompose(args.dir, args.given) : await checkAuthor(args.dir, /** @type {"game" | "score"} */ (args.role));
    for (const d of r.diagnostics) console.log(`${join(args.dir, d.file)}:${d.line}: ${d.code}${d.severity === "warning" ? " (warning)" : ""} ${d.message}\n  fix: ${d.fix}`);
    for (const n of /** @type {any} */ (r).notes ?? []) console.log(`note: ${n}`);
    const errors = r.diagnostics.filter((d) => d.severity === "error").length;
    console.log(r.ok ? `${args.dir}: no violations` : `${args.dir}: ${errors} violation${errors === 1 ? "" : "s"}`);
    // `codes` (the errors' codes) is the field scripts/seams-trial/summary.js counts
    Object.assign(entry, { ok: r.ok, codes: r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code), diagnostics: r.diagnostics });
    return finish(r.ok ? EXIT.ok : EXIT.violations);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (e instanceof CheckTargetError) { console.error(`error: ${err.message}`); return finish(EXIT.target, err.message); }
    console.error(`error: the checker itself failed: ${err.message}`);
    return finish(EXIT.crash, `the checker failed: ${err.stack ?? err.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
