// Turns a path inside the defineUI declaration (["tiles", "health", "body", 2, "rows"]) into a line of the UI
// file. There is no parser for whole modules here, so it searches the text from the defineUI call: each key in
// turn, as `key:` or `"key":` (from the top of the file when it is not found after the call, for a declaration
// built in variables above it); a list item by its `label` when it has one. A lambda is found by its own text, in
// code, after the key that holds it.

import { blank } from "../../../kit/parse/blank.js";

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
  let pos = Math.max(0, src.indexOf("defineUI("));
  /** @type {any} */
  let v = decl;
  for (const seg of path) {
    const item = v?.[seg];
    if (typeof seg === "number") {
      if (item && typeof item === "object" && typeof item.label === "string") {
        const at = src.indexOf(`label: ${JSON.stringify(item.label)}`, pos);
        if (at >= 0) pos = at;
      } else if (typeof item === "string") {
        const at = src.indexOf(JSON.stringify(item), pos);
        if (at >= 0) pos = at;
      }
    } else {
      const re = new RegExp(`(?<![\\w$])(["']?)${escape(seg)}\\1\\s*:`, "g");
      re.lastIndex = pos;
      let m = re.exec(src);
      if (!m) { re.lastIndex = 0; m = re.exec(src); }
      if (m) pos = m.index; // a key not written out (a shorthand `tiles`) is skipped, and the next is searched for
      else { v = item; continue; }
    }
    v = item;
  }
  return pos;
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
