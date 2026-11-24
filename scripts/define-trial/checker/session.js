// The state of one check: which directory is under test, the source of every candidate file, and what the
// stub kit/define has recorded. kit/define is loaded once per process (through the module hook), so it
// reports here rather than returning to the checker.

import { locate } from "./locate.js";

/** @import { CheckDiagnostic, CheckCode } from "./codes.js" */

/**
 * A violation found in a definition, addressed by its path inside the definition object; the session turns
 * the path into a line of the file that made the call.
 * @typedef {object} Problem
 * @property {CheckCode} code
 * @property {Array<string | number>} path
 * @property {string} message
 * @property {string} fix
 */

/** @typedef {{ file: string, line: number }} Site */

/**
 * One builder call an example made.
 * @typedef {object} Call
 * @property {string} construct  The construct whose method it was.
 * @property {string} method
 * @property {"open" | "slot" | "rejected" | "kit" | "unknown"} what
 * @property {unknown[]} args
 * @property {number} line
 */

/**
 * The calls one root-builder invocation recorded.
 * @typedef {object} Recording
 * @property {string} file
 * @property {number} line
 * @property {Call[]} calls
 */

export const session = {
  run: 0,
  /** The candidate directory as a file URL ending in `/`. */
  dirUrl: "",
  /** @type {Record<string, string>} each candidate file's text, by its path relative to the directory */
  sources: {},
  /** @type {CheckDiagnostic[]} */
  diagnostics: [],
  /** @type {WeakSet<object>} what defineDialect returned */
  dialects: new WeakSet(),
  /** @type {Record<string, unknown> | null} */
  dialect: null,
  /** @type {{ def: unknown, dialect: Record<string, unknown> | null } | null} */
  grammar: null,
  /** @type {Recording[]} */
  recordings: [],

  /**
   * Starts a new check of `dirUrl`.
   * @param {string} dirUrl
   * @param {Record<string, string>} sources
   */
  reset(dirUrl, sources) {
    this.run++;
    this.dirUrl = dirUrl;
    this.sources = sources;
    this.diagnostics = [];
    this.dialects = new WeakSet();
    this.dialect = null;
    this.grammar = null;
    this.recordings = [];
  },

  /** @param {CheckDiagnostic} d */
  add(d) {
    if (!this.diagnostics.some((x) => x.file === d.file && x.line === d.line && x.code === d.code && x.message === d.message)) this.diagnostics.push(d);
  },

  /**
   * Records the problems a define call found, each at the line its path leads to.
   * @param {Site} site
   * @param {Problem[]} problems
   */
  report(site, problems) {
    const src = this.sources[site.file] ?? "";
    for (const p of problems) this.add({ file: site.file, line: locate(src, site.line, p.path), code: p.code, severity: "error", message: p.message, fix: p.fix });
  },
};

const FRAME = /(file:\/\/[^\s)]+?):(\d+):\d+/g;

/**
 * The innermost place in a candidate file on the current stack: the author's call.
 * @returns {Site}
 */
export function callSite() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const m of stack.matchAll(FRAME)) {
    const url = m[1].replace(/\?.*$/, "");
    if (session.dirUrl && url.startsWith(session.dirUrl)) return { file: decodeURIComponent(url.slice(session.dirUrl.length)), line: Number(m[2]) };
  }
  return { file: "", line: 1 };
}
