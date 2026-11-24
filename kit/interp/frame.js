// The state of one run and of each kernel call in it: the shared budget, and a call's scope.

/** @import { Kernel, Span } from "../ir/ir.js" */
/** @import { RunEnv, Value } from "./interp.js" */

export const DEFAULT_MAX_STEPS = 10_000_000;
export const DEFAULT_MAX_DEPTH = 200;

/** A block's names. A name is bound by `let` (or a parameter, a loop's counter or item) and found by walking outward. */
export class Scope {
  /** @param {Scope | null} parent */
  constructor(parent) {
    this.parent = parent;
    /** @type {Map<string, Value>} */
    this.vars = new Map();
  }

  /** @param {string} name @param {Value} value */
  declare(name, value) { this.vars.set(name, value); }

  /** @param {string} name @returns {Scope} */
  owner(name) {
    /** @type {Scope | null} */
    let s = this;
    while (s && !s.vars.has(name)) s = s.parent;
    if (!s) throw new Error(`'${name}' is not bound`);
    return s;
  }

  /** @param {string} name */
  get(name) { return this.owner(name).vars.get(name); }

  /** @param {string} name @param {Value} value */
  assign(name, value) { this.owner(name).vars.set(name, value); }
}

/**
 * What every call in one `run` shares.
 * @typedef {object} Machine
 * @property {RunEnv} env
 * @property {number} steps  Loop passes and calls so far.
 * @property {(kernel: Kernel, args: Value[], depth: number) => Value} call  Runs a kernel; set by `run.js`.
 */

/**
 * One kernel call.
 * @typedef {object} Frame
 * @property {Machine} m
 * @property {Kernel} kernel
 * @property {Scope} scope  The innermost block's.
 * @property {number} depth
 */

/**
 * Counts one step against the budget.
 * @param {Machine} m
 * @param {string} what
 */
export function step(m, what) {
  if (++m.steps > (m.env.maxSteps ?? DEFAULT_MAX_STEPS)) throw new Error(`the run passed its step budget (${m.env.maxSteps ?? DEFAULT_MAX_STEPS}) in ${what}`);
}

/**
 * Tells the hook about a finished node.
 * @param {Frame} f
 * @param {{ k: string, span: Span }} node
 * @param {boolean} stmt
 * @param {Value} value
 * @param {string} path
 */
export function report(f, node, stmt, value, path) {
  f.m.env.onNode?.({ kind: node.k, stmt, span: node.span, value, path, kernel: f.kernel.name, depth: f.depth });
}
