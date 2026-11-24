// The Definition API trial's checker (the kit's `check` v0): loads a candidate directory's Dialect,
// Grammar and examples with a stub kit/define, and returns every violation of rules.md's D… and C… codes.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { session } from "./session.js";
import { installHooks, DEFINE_SPECIFIER } from "./hooks.js";
import { HELPERS, isPlainObject } from "./tags.js";
import { didYouMean } from "./common.js";
import { offsetOfLine, lineAt } from "./locate.js";
import { parseRuntime, freeNames } from "./lambda.js";
import { constructsOf } from "./grammar.js";
import { DIALECT_KEYS } from "./dialect.js";
import { BUILDER, BUILT } from "./builder.js";
import { LOAD } from "./codes.js";

/** @import { Recording, Call } from "./session.js" */

export { CHECK_CODES, LOAD } from "./codes.js";
/** @typedef {import("./codes.js").CheckDiagnostic} CheckDiagnostic */

export const DIALECT_FILE = "data.dialect.js";
export const GRAMMAR_FILE = "data.grammar.js";
export const EXAMPLES_DIR = "examples";
const REFUSED = /^\/\/ REFUSED: \S/;

/** A candidate directory the checker cannot read: missing, or without its definition files. */
export class CheckTargetError extends Error {}

/**
 * @typedef {object} CheckResult
 * @property {boolean} ok  No error-severity diagnostic.
 * @property {CheckDiagnostic[]} diagnostics  In file order (Dialect, Grammar, examples), then by line.
 * @property {Record<string, string>} files  Every candidate file's text, by its path relative to the directory.
 */

let queue = Promise.resolve();

/**
 * Checks one candidate directory. Checks run one at a time (the stub kit/define reports to one session).
 * @param {string} dir
 * @returns {Promise<CheckResult>}
 */
export function checkDir(dir) {
  const run = queue.then(() => checkNow(resolve(dir)));
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** @param {string} dir @returns {Promise<CheckResult>} */
async function checkNow(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new CheckTargetError(`${dir} is not a directory; give the directory that holds ${DIALECT_FILE}, ${GRAMMAR_FILE} and ${EXAMPLES_DIR}/`);
  for (const f of [DIALECT_FILE, GRAMMAR_FILE]) if (!existsSync(join(dir, f))) throw new CheckTargetError(`${join(dir, f)} does not exist; rules.md's hand-in needs ${DIALECT_FILE} and ${GRAMMAR_FILE}`);
  const exDir = join(dir, EXAMPLES_DIR);
  const examples = existsSync(exDir) ? readdirSync(exDir).filter((f) => f.endsWith(".js")).sort().map((f) => `${EXAMPLES_DIR}/${f}`) : [];
  const order = [DIALECT_FILE, GRAMMAR_FILE, ...examples];
  /** @type {Record<string, string>} */
  const sources = Object.fromEntries(order.map((f) => [f, readFileSync(join(dir, f), "utf8")]));

  installHooks();
  // Node names modules by their real path (macOS's /var is /private/var), and so do stack frames.
  const dirUrl = pathToFileURL(realpathSync(dir)).href.replace(/\/?$/, "/");
  session.reset(dirUrl, sources);
  /** @param {string} f */
  const load = (f) => import(`${dirUrl}${f.split("/").map(encodeURIComponent).join("/")}?run=${session.run}`);

  let definitionsLoaded = true;
  try {
    await load(DIALECT_FILE);
    if (!session.dialect) loadFailure(DIALECT_FILE, 1, `${DIALECT_FILE} does not call defineDialect.`, `write export const data = defineDialect({ … }), importing defineDialect from "${DEFINE_SPECIFIER}"`);
  } catch (e) {
    definitionsLoaded = false;
    reportLoadError(e, DIALECT_FILE);
  }
  try {
    await load(GRAMMAR_FILE);
    if (!session.grammar) { definitionsLoaded = false; loadFailure(GRAMMAR_FILE, 1, `${GRAMMAR_FILE} does not call defineGrammar.`, `write export const program = defineGrammar(data, { … }), importing defineGrammar from "${DEFINE_SPECIFIER}"`); }
  } catch (e) {
    definitionsLoaded = false;
    reportLoadError(e, GRAMMAR_FILE);
  }

  // Examples import the grammar; while it does not load, each would only repeat its error.
  if (definitionsLoaded) {
    for (const f of examples) {
      /** @type {Record<string, unknown> | null} */
      let mod = null;
      try {
        mod = await load(f);
      } catch (e) {
        reportLoadError(e, f);
      }
      if (mod) checkExport(f, mod.default);
    }
    for (const rec of session.recordings) checkLambdas(rec);
  }

  const rank = (/** @type {string} */ f) => (order.includes(f) ? order.indexOf(f) : order.length);
  const diagnostics = [...session.diagnostics].sort((a, b) => rank(a.file) - rank(b.file) || a.line - b.line);
  return { ok: !diagnostics.some((d) => d.severity === "error"), diagnostics, files: sources };
}

/**
 * @param {string} file @param {number} line @param {string} message @param {string} fix
 */
function loadFailure(file, line, message, fix) {
  session.add({ file, line, code: file.startsWith(`${EXAMPLES_DIR}/`) ? "C001" : LOAD, severity: "error", message, fix });
}

const FRAME = /(file:\/\/[^\s)]+?):(\d+)(?::\d+)?/g;

/**
 * An import that threw: a helper kit/define lacks is D011; anything else is reported against the file.
 * @param {unknown} e
 * @param {string} file  the file whose import threw
 */
function reportLoadError(e, file) {
  const err = e instanceof Error ? e : new Error(String(e));
  // The innermost candidate file on the error's stack is where it went wrong (a syntax error's position
  // comes first in the stack, as `file:…:line`).
  let where = { file, line: 1 };
  for (const m of `${err.stack ?? ""}`.matchAll(FRAME)) {
    const url = m[1].replace(/\?.*$/, "");
    if (url.startsWith(session.dirUrl)) { where = { file: decodeURIComponent(url.slice(session.dirUrl.length)), line: Number(m[2]) }; break; }
  }
  const missing = /The requested module '([^']+)' does not provide an export named '([^']+)'/.exec(err.message);
  if (missing && missing[1] === DEFINE_SPECIFIER) {
    session.add({ file: where.file, line: where.line, code: "D011", severity: "error", message: `${DEFINE_SPECIFIER} has no helper '${missing[2]}'.${didYouMean(missing[2], HELPERS)}`, fix: `import only the draft's helpers: ${HELPERS.join(", ")}` });
    return;
  }
  const fix = err instanceof SyntaxError ? "fix the JavaScript syntax at that line" : "the file must load: only kit/define and your own files may be imported, and nothing may be read from outside them";
  if (where.file !== file && !where.file.startsWith(`${EXAMPLES_DIR}/`) && file.startsWith(`${EXAMPLES_DIR}/`)) where = { file, line: 1 };
  loadFailure(where.file, where.line, `${file} could not be loaded: ${err.name}: ${err.message.split("\n")[0]}`, fix);
}

/**
 * C001: an example exports a builder chain, or begins with `// REFUSED: <code>`.
 * @param {string} file
 * @param {unknown} exported
 */
function checkExport(file, exported) {
  const src = session.sources[file] ?? "";
  const refused = REFUSED.test(src.split("\n")[0].trimEnd());
  // Outside a "type": "module" package a file with no ESM syntax loads as CommonJS, whose default is {}.
  if (!/\bexport\b/.test(src)) exported = undefined;
  const isBuilder = (exported !== null && typeof exported === "object" && /** @type {Record<symbol, unknown>} */ (exported)[BUILDER] !== undefined);
  if (isBuilder) return;
  if (exported !== null && typeof exported === "object" && BUILT in exported) {
    session.add({ file, line: 1, code: "C001", severity: "error", message: `${file} exports what .build() returns, not the builder chain.`, fix: "remove .build() from the end of the exported chain: export default program(…)…;" });
    return;
  }
  if (refused && exported === undefined) return;
  session.add({
    file, line: 1, code: "C001", severity: "error",
    message: exported === undefined ? `${file} neither exports a builder chain nor starts with // REFUSED: <code>.` : `${file}'s default export is not a builder chain.`,
    fix: "end it with export default program(\"…\")…; (without .build()), or make its first line // REFUSED: <code> followed by the diagnostic and why",
  });
}

/**
 * The names the free-name rule allows every lambda of a Program, before its own parameters and locals.
 * @param {Recording} rec
 */
function allowedNames(rec) {
  const d = session.dialect ?? {};
  /** @param {unknown} v */
  const keys = (v) => (isPlainObject(v) ? Object.keys(v) : []);
  const units = unitCalls(rec).map((c) => c.args[0]).filter((n) => typeof n === "string");
  return new Set([...keys(d.globals), ...keys(d.intrinsics), ...keys(d.types), ...keys(d.library), ...units]);
}

/**
 * Names declared under a top-level key defineDialect does not take (a typo such as `intrinsic:`), each
 * with that key, so a lambda's C003 can point at the D001 that caused it.
 * @returns {Map<string, string>}
 */
function misfiledNames() {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [k, v] of Object.entries(session.dialect ?? {})) {
    if (DIALECT_KEYS.includes(k) || !isPlainObject(v)) continue;
    for (const n of Object.keys(v)) if (!out.has(n)) out.set(n, k);
  }
  return out;
}

/** @param {Call} c */
const slotOf = (c) => {
  const cs = constructsOf(session.grammar?.def);
  const slots = cs[c.construct]?.slots;
  const s = isPlainObject(slots) ? slots[c.method] : undefined;
  return isPlainObject(s) ? s : null;
};

/** @param {Recording} rec */
const unitCalls = (rec) => rec.calls.filter((c) => c.what === "slot" && slotOf(c)?.kind === "unit");

/**
 * C002 and C003 for every Runtime Lambda (and unit source) one Program passes.
 * @param {Recording} rec
 */
function checkLambdas(rec) {
  const allowed = allowedNames(rec);
  for (const c of rec.calls) {
    if (c.what !== "slot") continue;
    const slot = slotOf(c);
    if (!slot) continue;
    if (slot.kind === "lambda") {
      const at = Array.isArray(slot.args) ? slot.args.length : 0;
      const src = c.args[at];
      if (typeof src === "function" || typeof src === "string") checkOne(rec, c, String(src), `the ${c.construct}.${c.method} lambda`, false, allowed);
    } else if (slot.kind === "unit") {
      const src = c.args[1];
      const unit = slot.unit === "const" ? "const" : "fn";
      if (typeof src === "function" || typeof src === "string") checkOne(rec, c, String(src), `${unit} '${String(c.args[0])}'`, unit === "const" && typeof src === "string", allowed);
    }
  }
}

/**
 * @param {Recording} rec @param {Call} call @param {string} src @param {string} what
 * @param {boolean} expression  a const unit's source: an expression, not a lambda
 * @param {Set<string>} allowed
 */
function checkOne(rec, call, src, what, expression, allowed) {
  const text = session.sources[rec.file] ?? "";
  const from = offsetOfLine(text, call.line);
  let at = text.indexOf(src, from);
  if (at < 0) at = text.indexOf(JSON.stringify(src).slice(1, -1), from);
  /** @param {number} inner 1-based line within src */
  const lineOf = (inner) => (at < 0 ? call.line : lineAt(text, at) + inner - 1);

  const r = parseRuntime(src, { expression });
  for (const d of r.diagnostics) {
    session.add({ file: rec.file, line: lineOf(d.loc.start.line), code: "C002", severity: d.severity, message: `${what}${d.severity === "warning" ? " (warning)" : ""}: ${d.code} ${d.message}`, fix: d.tip || "rewrite it in the Runtime Subset" });
  }
  if (!r.ast) return;
  const hasDollar = allowed.has("$");
  const misfiled = misfiledNames();
  for (const { name, loc } of freeNames(r.ast)) {
    if (allowed.has(name)) continue;
    const near = misfiled.has(name)
      ? ` It is declared under '${misfiled.get(name)}', which defineDialect does not take (D001).`
      : name.length > 1 ? didYouMean(name, [...allowed].filter((n) => n !== "$")) : "";
    session.add({
      file: rec.file, line: lineOf(loc.start.line), code: "C003", severity: "error",
      message: name === "$"
        ? `${what} reads '$', which this Dialect does not declare as a global.`
        : `${what} reads '${name}', which it cannot see: only its text is compiled.${near}`,
      fix: name === "$"
        ? `declare $ in the Dialect's globals (e.g. globals: { $: "Params" }) to give lambdas the Program's parameters, or pass the value another way`
        : `declare it on the Program (.const("${name}", "…") or .fn("${name}", …)), use a Dialect global, intrinsic, vector type or library name${hasDollar ? `, or make it a parameter and read $.${name}` : ""}`,
    });
  }
}
