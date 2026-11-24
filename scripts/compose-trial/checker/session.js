// The state of one check: the candidate directory, its files, and everything the stand-in dialects recorded
// while program.js was built. The stand-ins are loaded once per process (through the module hook), so they
// record here rather than returning to the checker.

/** @import { CheckDiagnostic } from "./codes.js" */
/** @import { Part, Actor, OutHandle, Params, Program } from "./handles.js" */

/** @typedef {{ file: string, line: number }} Site */

/**
 * A runtime lambda handed to a slot, read from its source once the build is done.
 * @typedef {object} LambdaRec
 * @property {Function} fn
 * @property {Site} site  the builder call that took it
 * @property {Part | null} part  the part it runs in (for an actor's update, filled in once the actor is spawned)
 * @property {Actor | null} actor  the actor whose update or init it is
 * @property {string} slot  e.g. "cave.carve", "actor.update", "tiles.spawn.init", "glow.light"
 * @property {string[]} roles  the role of each parameter: cell, pixel, spawn, self, world
 * @property {string} [exportType]  for tiles.export: the declared type
 */

export const session = {
  run: 0,
  /** The candidate directory as a file URL ending in `/`. */
  dirUrl: "",
  /** @type {Record<string, string>} each candidate file's text, by path relative to the directory */
  sources: {},
  /** @type {CheckDiagnostic[]} */
  diagnostics: [],
  /** @type {Part[]} */
  parts: [],
  /** @type {Actor[]} */
  actors: [],
  /** @type {Params | null} */
  params: null,
  /** @type {Program[]} */
  programs: [],
  /** @type {LambdaRec[]} */
  lambdas: [],
  /** @type {OutHandle[]} every output handle taken during the build */
  handles: [],
  /** @type {Set<string>} parameters read by build-time code */
  buildParamReads: new Set(),
  /** @type {import("./source.js").FileScan | null} program.js, scanned before it loads */
  scan: null,

  /** @param {string} dirUrl @param {Record<string, string>} sources */
  reset(dirUrl, sources) {
    this.run++;
    this.scan = null;
    this.dirUrl = dirUrl;
    this.sources = sources;
    this.diagnostics = [];
    this.parts = [];
    this.actors = [];
    this.params = null;
    this.programs = [];
    this.lambdas = [];
    this.handles = [];
    this.buildParamReads = new Set();
  },

  /**
   * Records a violation (an error unless said otherwise); an exact repeat is dropped.
   * @param {string} code @param {Site} site @param {string} message @param {string} fix
   * @param {"error" | "warning"} [severity]
   */
  add(code, site, message, fix, severity = "error") {
    const d = { file: site.file, line: site.line, code, severity, message, fix };
    if (!this.diagnostics.some((x) => x.file === d.file && x.line === d.line && x.code === d.code && x.message === d.message)) this.diagnostics.push(d);
  },

  /** @param {Site} site @param {string} [code] whether a diagnostic (of this code) is already at this line */
  has(site, code) {
    return this.diagnostics.some((d) => d.file === site.file && d.line === site.line && (!code || d.code === code));
  },

  /**
   * A file URL (with or without the per-check query) as a path relative to the candidate directory, or null.
   * @param {string | undefined} url
   */
  relative(url) {
    const u = (url ?? "").replace(/\?.*$/, "");
    return this.dirUrl && u.startsWith(this.dirUrl) ? decodeURIComponent(u.slice(this.dirUrl.length)) : null;
  },

  /** The text of one line of a candidate file. @param {Site} site */
  lineText(site) {
    return (this.sources[site.file] ?? "").split("\n")[site.line - 1] ?? "";
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
export const callSite = () => candidateFrame() ?? { file: "program.js", line: 1 };
