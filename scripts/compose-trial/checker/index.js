// The composition trial's checker: loads a hand-in's program.js with stand-in dialects that record every
// builder call, reads every runtime lambda and lib/ helper from source, cross-checks the parts, and checks
// the seams the task asks for. Returns every diagnostic (rules.md lists the codes).

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { session, candidateFrame } from "./session.js";
import { installHooks, isAllowedImport, importMessage } from "./hooks.js";
import { scanFile } from "./source.js";
import { unwrap, Program, Part } from "./handles.js";
import { analyzeLambda, analyzeHelper } from "./lambdas.js";
import { crossCheck, goals } from "./seams.js";
import { staticBuildReads } from "./buildreads.js";

export { CODES } from "./codes.js";
/** @typedef {import("./codes.js").CheckDiagnostic} CheckDiagnostic */
/** @import { Binding, Reads } from "./lambdas.js" */
/** @import { LambdaRec } from "./session.js" */

export const PROGRAM_FILE = "program.js";
export const LIB_DIR = "lib";

/** A candidate directory the checker cannot read: missing, or without program.js. */
export class CheckTargetError extends Error {}

/**
 * @typedef {object} CheckResult
 * @property {boolean} ok  No error-severity diagnostic.
 * @property {CheckDiagnostic[]} diagnostics  program.js first, then lib/ files, each by line.
 * @property {Record<string, string>} files  Every candidate file's text, by its path relative to the directory.
 */

let queue = Promise.resolve();

/**
 * Checks one candidate directory. Checks run one at a time (the stand-ins report to one session).
 * @param {string} dir
 * @returns {Promise<CheckResult>}
 */
export function checkDir(dir) {
  const run = queue.then(() => checkNow(resolve(dir)));
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * The candidate's files: program.js, then lib/*.js in name order, and each one's text.
 * @param {string} dir
 */
export function readCandidate(dir) {
  const libDir = join(dir, LIB_DIR);
  const libs = existsSync(libDir) ? readdirSync(libDir).filter((f) => f.endsWith(".js")).sort().map((f) => `${LIB_DIR}/${f}`) : [];
  const order = [PROGRAM_FILE, ...libs];
  /** @type {Record<string, string>} */
  const sources = Object.fromEntries(order.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
  return { order, libs, sources };
}

/** @param {string} dir @returns {Promise<CheckResult>} */
async function checkNow(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new CheckTargetError(`${dir} is not a directory; give the directory that holds ${PROGRAM_FILE} and ${LIB_DIR}/`);
  if (!existsSync(join(dir, PROGRAM_FILE))) throw new CheckTargetError(`${join(dir, PROGRAM_FILE)} does not exist; rules.md's hand-in needs ${PROGRAM_FILE}`);
  const { order, libs, sources } = readCandidate(dir);
  const scans = Object.fromEntries(order.map((f) => [f, scanFile(sources[f])]));

  installHooks();
  const dirUrl = pathToFileURL(realpathSync(dir)).href.replace(/\/?$/, "/");
  session.reset(dirUrl, sources);
  session.scan = scans[PROGRAM_FILE];
  const result = () => {
    const rank = (/** @type {string} */ f) => (order.includes(f) ? order.indexOf(f) : order.length);
    const diagnostics = [...session.diagnostics].sort((a, b) => rank(a.file) - rank(b.file) || a.line - b.line);
    return { ok: !diagnostics.some((d) => d.severity === "error"), diagnostics, files: sources };
  };

  if (!importsAllowed(order, scans)) return result();
  /** @param {string} f */
  const load = (f) => import(`${dirUrl}${f.split("/").map(encodeURIComponent).join("/")}?run=${session.run}`);

  /** @type {Record<string, unknown> | null} */
  let mod = null;
  try { mod = await load(PROGRAM_FILE); } catch (e) { reportLoadError(e, PROGRAM_FILE); }
  /** @type {Map<string, Record<string, unknown>>} */
  const libMods = new Map();
  for (const f of libs) {
    try { libMods.set(f, await load(f)); } catch (e) { reportLoadError(e, f); }
  }
  if (!mod) return result();

  checkDefaultExport(mod.default);
  const bindings = bindingsOf(scans[PROGRAM_FILE]);
  for (const p of session.parts) if (!p.binding) session.add("C002", p.site, `${p.dialect} '${p.name}' is not bound to a top-level const.`, `bind it: const ${p.name.replace(/\W/g, "") || "part"} = ${p.dialect}("${p.name}")…`);
  for (const a of session.actors) {
    const isPlayer = session.parts.some((p) => /** @type {any} */ (p).player?.actor === a);
    if (!a.part && !isPlayer) session.add("D006", a.site, `actor ${a.label} is never spawned by a tiles part.`, `spawn it: .spawn(${a.label}, <spawn points>, { kind: "…" }), or remove it`);
  }

  /** @type {Map<LambdaRec, Reads>} */
  const reads = new Map();
  for (const rec of session.lambdas) reads.set(rec, analyzeLambda(rec, bindings));
  for (const [f, m] of libMods) checkLib(f, m, scans[f]);
  for (const p of session.parts) p.finalize();
  staticBuildReads();
  crossCheck();
  if (!session.diagnostics.some((d) => d.code === "C001" || d.code === "C003")) goals(reads);
  return result();
}

/**
 * C003 for an import of anything but the four modules and lib/ files. Returns whether all were allowed.
 * @param {string[]} files @param {Record<string, import("./source.js").FileScan>} scans
 */
function importsAllowed(files, scans) {
  let ok = true;
  for (const f of files) {
    for (const imp of scans[f].imports) {
      if (!isAllowedImport(f, imp.from)) {
        ok = false;
        session.add("C003", { file: f, line: imp.line }, importMessage(f, imp.from), "remove the import");
      }
    }
  }
  return ok;
}

/** @param {unknown} v */
function checkDefaultExport(v) {
  const line = (session.sources[PROGRAM_FILE].split("\n").findIndex((l) => /^export\s+default\b/.test(l)) + 1) || 1;
  const site = { file: PROGRAM_FILE, line };
  const p = unwrap(v);
  if (!(p instanceof Program)) { session.add("C001", site, "program.js must export default a program(title).show(part).", 'export default program("My Game").show(light);'); return; }
  if (!p.shows.length) { session.add("C001", site, "the program shows nothing: add .show(part).", `program(${JSON.stringify(p.title)}).show(<the part on screen>)`); return; }
  for (const s of p.shows) {
    const part = unwrap(s.part);
    if (!(part instanceof Part) || part.dialect === "cave") session.add("D002", s.site, ".show() takes a tiles or glow part, whose image is shown.", ".show(light)");
  }
}

/**
 * What each top-level name of program.js is.
 * @param {import("./source.js").FileScan} scan
 * @returns {Map<string, Binding>}
 */
function bindingsOf(scan) {
  /** @type {Map<string, Binding>} */
  const m = new Map();
  for (const d of scan.decls.values()) {
    if (/^program\s*\(/.test(d.rhs)) m.set(d.name, { kind: "program" });
    else m.set(d.name, { kind: "const", fn: /^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.test(d.rhs) });
  }
  for (const imp of scan.imports) for (const [local, exported] of imp.names) m.set(local, { kind: "import", from: imp.from, exported });
  for (const p of session.parts) if (p.binding) m.set(p.binding, { kind: "part", part: p });
  for (const a of session.actors) if (a.binding) m.set(a.binding, { kind: "actor", actor: a });
  if (session.params?.binding) m.set(session.params.binding, { kind: "params" });
  return m;
}

/**
 * Every export of a lib/ file is a kernel helper: an arrow function in the subset, reading only its
 * arguments, intrinsics and other helpers.
 * @param {string} file @param {Record<string, unknown>} mod @param {import("./source.js").FileScan} scan
 */
function checkLib(file, mod, scan) {
  const names = new Set(Object.keys(mod));
  for (const imp of scan.imports) for (const local of imp.names.keys()) names.add(local);
  for (const [name, v] of Object.entries(mod)) {
    const line = scan.decls.get(name)?.line ?? 1;
    if (typeof v !== "function") { session.add("S331", { file, line }, `${file} exports ${name}, which is not a function; lib/ holds only kernel helpers.`, `move ${name} into program.js as a top-level const`); continue; }
    analyzeHelper(v, file, names);
  }
}

/**
 * An import that threw: a part used before it exists (an output read at build time) is S301; anything else
 * is C003 at the line that threw.
 * @param {unknown} e @param {string} file
 */
function reportLoadError(e, file) {
  const err = e instanceof Error ? e : new Error(String(e));
  const tdz = /Cannot access '([\w$]+)' before initialization/.exec(err.message);
  const where = candidateFrame(`${err.stack ?? ""}`) ?? (err instanceof SyntaxError ? syntaxErrorSite() : null) ?? { file, line: 1 };
  if (tdz && /^(cave|tiles|glow)\s*\(/.test(session.scan?.decls.get(tdz[1])?.rhs ?? "")) {
    session.add("S301", where, `${tdz[1]}.out.… is known only at run time, but it was read at build time (${tdz[1]} is not even built yet).`, buildFix(where));
    return;
  }
  const missing = /Cannot find (?:package|module) '([^']+)'/.exec(err.message);
  if (missing) {
    const spec = missing[1].split(/[/\\]/).pop() ?? missing[1];
    const line = (session.sources[file]?.split("\n").findIndex((l) => /^import\b/.test(l) && l.includes(spec)) ?? -1) + 1;
    session.add("C003", { file, line: line || 1 }, `${file} could not be loaded: it imports '${missing[1]}', which does not exist.`, 'import only "kit", "cave", "tiles", "glow" and your own ./lib/ files');
    return;
  }
  session.add("C003", where, `${file} could not be loaded: ${err.name}: ${err.message.split("\n")[0]}`, err instanceof SyntaxError ? "fix the JavaScript syntax at that line" : "the file must run top to bottom at build time without throwing");
}

/** The lambda form of the call on a line that threw. @param {{ file: string, line: number }} site */
function buildFix(site) {
  const text = session.lineText(site);
  const m = /\.(\w+)\((.*)\)\s*$/.exec(text.trim());
  return m ? `write the argument as a lambda, which runs while the program runs: .${m[1]}(() => ${m[2]})` : "read another part's output only inside a runtime lambda: () => …";
}

/**
 * Where the first candidate file with a syntax error has it: an import's SyntaxError carries no position,
 * so each file is parsed with `node --check`, which prints `<path>:<line>`.
 * @returns {{ file: string, line: number } | null}
 */
function syntaxErrorSite() {
  for (const file of Object.keys(session.sources)) {
    const path = fileURLToPath(new URL(file, session.dirUrl));
    const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    if (r.status === 0) continue;
    const m = /^.*:(\d+)\n/.exec(r.stderr);
    return { file, line: m ? Number(m[1]) : 1 };
  }
  return null;
}
