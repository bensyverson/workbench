// The pixel debugger: runs one pixel of a lowered fields Program in the reference interpreter and
// keeps every node it evaluates, in order, with its source span, value and call depth. A shader
// Kernel has a CPU form, so a pixel can be stepped through without a GPU.

import { run } from "../interp/index.js";
import { INTRINSICS } from "../dialects/fields/index.js";
import { showType } from "../ir/types.js";
import { formatValue } from "./format.js";

/** @import { Kernel, Type, Span } from "../ir/ir.js" */
/** @import { FieldLowering } from "../dialects/fields/program.js" */
/** @import { NodeEvent } from "../interp/interp.js" */

/**
 * One evaluated node.
 * @typedef {object} Step
 * @property {number} index  Position in the trace, from 0.
 * @property {string} kernel  The Kernel the node belongs to: the pixel's or a helper's.
 * @property {Span} span  Offsets into that Kernel's own source (`PixelTrace.sources[kernel]`).
 * @property {string} text  The source slice the span covers.
 * @property {number} line  1-based line of the span's start, in that Kernel's source.
 * @property {number} column  1-based column of the span's start.
 * @property {string} kind  The node's kind: `op`, `local`, `let`, `return`, `helper` ...
 * @property {boolean} stmt  True for a statement.
 * @property {unknown} value  What the node produced (a vector as its array).
 * @property {string} type  The value's type as written in the IR (`f32`, `vec2`), or `""` when the node has none.
 * @property {string} shown  The value formatted by its type.
 * @property {string} path  Where the node is in its Kernel, as the verifier writes it.
 * @property {number} depth  How many Kernel calls deep it ran: 0 in the pixel Kernel.
 */

/**
 * @typedef {object} PixelTrace
 * @property {Step[]} steps
 * @property {unknown} result  What the pixel Kernel returned.
 * @property {Record<string, string>} sources  Each Kernel's source text, by name.
 */

/**
 * @typedef {object} LineGroup
 * @property {string} kernel
 * @property {number} line
 * @property {string} text  The whole source line.
 * @property {Step[]} steps
 */

/**
 * The node at `path` of `kernel`, as the verifier writes paths (`body[0].then[1].value.args[0]`).
 * @param {Kernel} kernel
 * @param {string} path
 * @returns {Record<string, any> | undefined}
 */
function nodeAt(kernel, path) {
  /** @type {any} */
  let node = kernel;
  for (const part of path.match(/[^.[\]]+/g) ?? []) {
    node = node?.[part];
    if (node === undefined) return undefined;
  }
  return node;
}

/**
 * The type of what a node produced: an expression's own, a `let`'s declared, otherwise that of the value it handled.
 * @param {Record<string, any> | undefined} node
 * @returns {Type | null}
 */
function valueType(node) {
  if (!node) return null;
  if (node.k === "let") return node.t;
  if (node.value && typeof node.value === "object" && "t" in node.value) return node.value.t;
  return "t" in node ? node.t : null;
}

/**
 * Where offset `at` of `src` is, 1-based.
 * @param {string} src
 * @param {number} at
 */
function lineColumn(src, at) {
  const before = src.slice(0, at);
  const line = before.split("\n").length;
  return { line, column: at - (before.lastIndexOf("\n") + 1) + 1 };
}

/**
 * Runs the pixel at `uv` and records every node evaluated.
 * @param {FieldLowering} lowering  From `lowerField`; its pixel Kernel and helpers are run.
 * @param {{ uv: number[], uniforms: Record<string, unknown> }} input  See `pixelUv` and `uniformsFor`.
 * @returns {PixelTrace}
 */
export function tracePixel(lowering, { uv, uniforms }) {
  const main = lowering.kernel;
  if (!main) throw new Error("the program did not lower, so there is no pixel Kernel to step through");
  /** @type {Record<string, Kernel>} */
  const byName = { [main.name]: main };
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of lowering.helpers) {
    if (h.kind !== "fn" || !h.result.kernel) continue;
    helpers[h.name] = h.result.kernel;
    byName[h.result.kernel.name] = h.result.kernel;
  }
  /** @type {Step[]} */
  const steps = [];
  /** @param {NodeEvent} e */
  const onNode = (e) => {
    const k = byName[e.kernel];
    const t = valueType(nodeAt(k, e.path));
    steps.push({
      index: steps.length,
      kernel: e.kernel,
      span: e.span,
      text: k.src.slice(e.span[0], e.span[1]),
      ...lineColumn(k.src, e.span[0]),
      kind: e.kind,
      stmt: e.stmt,
      value: e.value,
      type: t === null ? "" : showType(t),
      shown: formatValue(e.value, t ?? "unknown"),
      path: e.path,
      depth: e.depth,
    });
  };
  const result = run(main, [uv, uniforms], { helpers, intrinsics: INTRINSICS, onNode });
  return { steps, result, sources: Object.fromEntries(Object.entries(byName).map(([n, k]) => [n, k.src])) };
}

/**
 * The color the pixel Kernel returned: its last top-level `return`, or null when it never returned.
 * @param {PixelTrace} trace
 * @returns {unknown}
 */
export function finalColor(trace) {
  const last = trace.steps.findLast((s) => s.depth === 0 && s.kind === "return");
  return last ? last.value : null;
}

/**
 * The steps grouped by the source line they belong to, in the order each line was first reached.
 * @param {PixelTrace} trace
 * @returns {LineGroup[]}
 */
export function groupByLine(trace) {
  /** @type {Map<string, LineGroup>} */
  const groups = new Map();
  for (const s of trace.steps) {
    const key = `${s.kernel}:${s.line}`;
    let g = groups.get(key);
    if (!g) {
      g = { kernel: s.kernel, line: s.line, text: trace.sources[s.kernel].split("\n")[s.line - 1], steps: [] };
      groups.set(key, g);
    }
    g.steps.push(s);
  }
  return [...groups.values()];
}
