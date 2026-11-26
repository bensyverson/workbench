// The glue program's place on the current stack: the innermost frame outside kit/compose and kit/define, so a
// composition diagnostic points at the glue's own line. Works with V8's and Firefox's stack formats.

/** @import { Loc } from "../parse/ast.js" */

const KIT = new URL("..", import.meta.url).href;
const SKIP = ["compose/", "define/"];
const FRAME = /((?:file|https?|data):[^\s()]+?):(\d+):(\d+)/g;

/** @returns {{ file: string, loc: Loc }} */
export function glueSite() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const m of stack.matchAll(FRAME)) {
    const url = m[1];
    // the modules themselves, not their folders' tests or fixtures
    if (url.startsWith(KIT) && SKIP.some((d) => { const rest = url.slice(KIT.length); return rest.startsWith(d) && !rest.slice(d.length).includes("/"); })) continue;
    const at = { line: Number(m[2]), column: Number(m[3]) - 1 };
    return { file: url, loc: { start: at, end: at } };
  }
  return { file: "", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } };
}
