// Turns a path inside a definition object (["intrinsics", "sin", "spell"]) into a line of the file that
// wrote it. The checker has no parser for whole modules, so it searches the text: from the define call's
// line, each key in turn, as `key:` or `"key":` (or `key(` for a method). A key it cannot find (a value
// written elsewhere and referenced by a variable) leaves the line at the last key found.

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} src
 * @param {number} line  1-based line to start from (the define call's).
 * @param {Array<string | number>} path
 * @returns {number}
 */
export function locate(src, line, path) {
  let pos = offsetOfLine(src, line);
  for (const seg of path) {
    if (typeof seg === "number") continue;
    const re = new RegExp(`(?<![\\w$])(["']?)${escape(seg)}\\1\\s*[:(]`, "g");
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) break;
    pos = m.index;
  }
  return lineAt(src, pos);
}

/**
 * The offset where 1-based `line` starts (the end of the text past the last line).
 * @param {string} src
 * @param {number} line
 */
export function offsetOfLine(src, line) {
  let pos = 0;
  for (let l = 1; l < line; l++) {
    const nl = src.indexOf("\n", pos);
    if (nl < 0) return src.length;
    pos = nl + 1;
  }
  return pos;
}

/**
 * The 1-based line holding offset `pos`.
 * @param {string} src
 * @param {number} pos
 */
export function lineAt(src, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}
