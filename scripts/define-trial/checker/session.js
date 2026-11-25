// The state of one check: which directory is under test, the source of every candidate file, and what the
// candidate's define calls made. The `kit/define` the candidate imports is loaded once per process (through
// the module hook), so it reports here rather than returning to the checker.

import { locate } from "./locate.js";

/** @import { CheckDiagnostic } from "./codes.js" */
/** @import { Dialect } from "../../../kit/define/define.js" */

/**
 * A problem kit/define found in a definition, addressed by its path inside the definition object; the
 * session turns the path into a line of the file that made the call.
 * @typedef {object} Problem
 * @property {string} code
 * @property {Array<string | number>} path
 * @property {string} message
 * @property {string} tip
 */

/** @typedef {{ file: string, line: number }} Site */

export const session = {
  run: 0,
  /** The candidate directory as a file URL ending in `/`. */
  dirUrl: "",
  /** @type {Record<string, string>} each candidate file's text, by its path relative to the directory */
  sources: {},
  /** @type {CheckDiagnostic[]} */
  diagnostics: [],
  /** @type {Dialect | null} the first Dialect defineDialect made */
  dialect: null,
  /** @type {Record<string, unknown> | null} the first definition passed to defineDialect, made or refused */
  dialectDef: null,
  /** @type {Site | null} where that defineDialect call is */
  dialectSite: null,
  /** @type {any} the first root builder defineGrammar made */
  grammar: null,
  /** Whether a define call was refused; the examples are then not run, since each would repeat it. */
  refused: false,
  /** Whether this check holds an example marked // REFUSED: <code> to failing (--effects, trial 4's rules). */
  effects: false,

  /**
   * Starts a new check of `dirUrl`.
   * @param {string} dirUrl
   * @param {Record<string, string>} sources
   * @param {boolean} [effects]  --effects mode
   */
  reset(dirUrl, sources, effects = false) {
    this.effects = effects;
    this.run++;
    this.dirUrl = dirUrl;
    this.sources = sources;
    this.diagnostics = [];
    this.dialect = null;
    this.dialectDef = null;
    this.dialectSite = null;
    this.grammar = null;
    this.refused = false;
  },

  /** @param {CheckDiagnostic} d */
  add(d) {
    if (!this.diagnostics.some((x) => x.file === d.file && x.line === d.line && x.code === d.code && x.message === d.message)) this.diagnostics.push(d);
  },

  /**
   * Records the problems a define call found, each at the line its path leads to.
   * @param {Site} site
   * @param {Problem[]} problems
   * @param {string} [suffix]  appended to each message
   */
  report(site, problems, suffix = "") {
    const src = this.sources[site.file] ?? "";
    for (const p of problems) this.add({ file: site.file, line: locate(src, site.line, p.path), code: p.code, severity: "error", message: `${p.message}${suffix}`, fix: p.tip || "the definition breaks one of the API's rules; the message names it" });
  },

  /**
   * A file URL (with or without the per-check query) as a path relative to the candidate directory, or null
   * when it is not a candidate file.
   * @param {string | undefined} url
   */
  relative(url) {
    const u = (url ?? "").replace(/\?.*$/, "");
    return this.dirUrl && u.startsWith(this.dirUrl) ? decodeURIComponent(u.slice(this.dirUrl.length)) : null;
  },
};

const FRAME = /(file:\/\/[^\s)]+?):(\d+)(?::\d+)?/g;

/**
 * The innermost place in a candidate file on a stack: the author's call, or where the author's code threw.
 * @param {string} [stack]  an error's stack; the current one when absent
 * @returns {Site | null}
 */
export function candidateFrame(stack) {
  if (stack === undefined) {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    stack = new Error().stack ?? "";
    Error.stackTraceLimit = limit;
  }
  for (const m of stack.matchAll(FRAME)) {
    const file = session.relative(m[1]);
    if (file !== null) return { file, line: Number(m[2]) };
  }
  return null;
}

/** The author's call on the current stack. @returns {Site} */
export const callSite = () => candidateFrame() ?? { file: "", line: 1 };
