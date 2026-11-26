// Turns a path inside the defineUI declaration (["tiles", "health", "body", 2, "rows"]) into a line of the UI
// file. There is no parser for whole modules here, so it searches the text from the defineUI call: each key in
// turn, in code only (not in a comment or a string), as `key:` or `"key":` (from the top of the file when it is
// not found after the call, for a declaration built in variables above it); a list item by its place in the list
// (the nth element of the array literal after its key). A lambda is found by its own text, in
// code, after the key that holds it.

import { blank } from "../../../kit/parse/module.js";

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The offset in `src` that a path inside the declaration points at.
 * @param {string} src  the UI file's text
 * @param {Array<string | number>} path
 * @param {unknown} decl  the declaration, to read list items' labels
 * @returns {number}
 */
export function locatePos(src, path, decl) {
  const code = blank(src);
  let pos = Math.max(0, src.indexOf("defineUI("));
  /** Where the value of the last key begins, for the list that may follow. */
  let valueAt = pos;
  /** @type {any} */
  let v = decl;
  for (const seg of path) {
    if (typeof seg === "number") {
      const at = nthElement(code, valueAt, seg);
      if (at >= 0) pos = valueAt = at;
    } else {
      const re = new RegExp(`(?<![\\w$])(["']?)${escape(seg)}\\1\\s*:`, "g");
      /** The first match at or after `from` that starts in code, not in a comment or a string. @param {number} from */
      const find = (from) => {
        re.lastIndex = from;
        for (let m = re.exec(src); m; m = re.exec(src)) if (code[m.index] === src[m.index]) return m;
        return null;
      };
      const m = find(valueAt) ?? find(0);
      // a key not written out (a shorthand `tiles`) is skipped, and the next is searched for
      if (m) { pos = m.index; valueAt = m.index + m[0].length; }
    }
    v = v?.[seg];
  }
  return pos;
}

/**
 * The offset of the nth element of the array literal whose `[` is the first code at or after `from`, or -1 when
 * the value there is not an array literal (a list built in a variable) or has fewer elements.
 * @param {string} code  the source with comments and strings blanked @param {number} from @param {number} n
 */
function nthElement(code, from, n) {
  let i = from;
  while (i < code.length && /\s/.test(code[i])) i++;
  if (code[i] !== "[") return -1;
  let depth = 0, index = 0, start = true;
  for (; i < code.length; i++) {
    const c = code[i];
    if (/\s/.test(c)) continue;
    if (depth === 1 && start) {
      if (c === "]") return -1;
      if (index === n) return i;
      start = false;
    }
    if ("[({".includes(c)) depth++;
    else if ("])}".includes(c)) { depth--; if (depth === 0) return -1; }
    else if (c === "," && depth === 1) { index++; start = true; }
  }
  return -1;
}

/**
 * @param {string} src @param {Array<string | number>} path @param {unknown} decl
 * @returns {number}  the 1-based line
 */
export const locate = (src, path, decl) => lineAt(src, locatePos(src, path, decl));

/**
 * The line where a lambda's text starts in the file: its first occurrence in code (not in a comment or a string) at
 * or after `from`, else the first anywhere in code; 0 when it is not found verbatim.
 * @param {string} src @param {Function} fn @param {number} [from]
 */
export function lambdaLine(src, fn, from = 0) {
  const text = String(fn);
  const code = blank(src);
  /** @param {number} start */
  const find = (start) => {
    for (let at = src.indexOf(text, start); at >= 0; at = src.indexOf(text, at + 1)) if (code[at] !== " " && code[at] !== "\n") return at;
    return -1;
  };
  const at = find(from);
  const found = at >= 0 ? at : find(0);
  return found < 0 ? 0 : lineAt(src, found);
}

/** The 1-based line holding offset `pos`. @param {string} src @param {number} pos */
export function lineAt(src, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}
