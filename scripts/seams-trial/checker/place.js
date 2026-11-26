// Where a seam problem found when a Program lowers belongs: at the port's or frame's line in the file that defined
// the Dialect, not at the example (or part) whose record exposed it. The line is found by the declaration path, as
// for a refused definition (the UI trial's locatePos), plus the line inside a lambda when the problem has one.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { locatePos, lineAt } from "../../ui-trial/checker/locate.js";

/** @import { PortDiagnostic } from "./port-lower.js" */

/** The declaration path a seam problem is about. @param {PortDiagnostic} d @returns {Array<string | number>} */
export function pathOf(d) {
  if (d.port !== undefined) return ["ports", "out", d.port, "from"];
  if (d.frame !== undefined) return ["frames", d.frame, "extent"];
  return ["edges"];
}

/**
 * The file (relative to `dirUrl`) and line of a seam problem in the Dialect's file, or null when that file is not
 * in the hand-in.
 * @param {PortDiagnostic} d @param {string} fileUrl  the Dialect file's URL (a query allowed) @param {unknown} decl  its declaration
 * @param {string} dirUrl  the hand-in folder, as a file URL ending in /
 * @returns {{ file: string, line: number } | null}
 */
export function placeSeam(d, fileUrl, decl, dirUrl) {
  const bare = fileUrl.replace(/\?.*$/, "");
  if (!bare.startsWith(dirUrl)) return null;
  let text;
  try { text = readFileSync(fileURLToPath(bare), "utf8"); } catch { return null; }
  const line = lineAt(text, locatePos(text, pathOf(d), decl));
  const inner = /** @type {any} */ (d.loc)?.start?.line;
  return { file: decodeURIComponent(bare.slice(dirUrl.length)), line: typeof inner === "number" && inner > 1 ? line + inner - 1 : line };
}
