// The author's place on the current stack: the innermost frame outside kit/define, so a diagnostic
// points at the builder or define call in the author's file. Works with V8's and Firefox's stack formats.

/** @import { Loc } from "../parse/ast.js" */

const HERE = new URL(".", import.meta.url).href;
const FRAME = /((?:file|https?|data):[^\s()]+?):(\d+):(\d+)/g;

/**
 * @returns {{ file: string, loc: Loc }}
 */
export function callSite() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const m of stack.matchAll(FRAME)) {
    const url = m[1];
    if (url.startsWith(HERE) && !url.slice(HERE.length).includes("/")) continue;
    if (url.startsWith("node:")) continue;
    const at = { line: Number(m[2]), column: Number(m[3]) - 1 };
    return { file: url, loc: { start: at, end: at } };
  }
  return { file: "", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } };
}
