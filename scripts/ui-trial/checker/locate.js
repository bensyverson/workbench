// Turns a path inside the defineUI declaration (["tiles", "health", "body", 2, "rows"]) into a line of the UI
// file. There is no parser for whole modules here, so it searches the text from the defineUI call: each key in
// turn, as `key:` or `"key":`; a list item by its `label` when it has one. A lambda is found by its own text.

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} src  the UI file's text
 * @param {Array<string | number>} path
 * @param {unknown} decl  the declaration, to read list items' labels
 * @returns {number}
 */
export function locate(src, path, decl) {
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
      const m = re.exec(src);
      if (!m) break;
      pos = m.index;
    }
    v = item;
  }
  return lineAt(src, pos);
}

/**
 * The line where a lambda's text starts in the file, or 0 when it is not found verbatim.
 * @param {string} src @param {Function} fn
 */
export function lambdaLine(src, fn) {
  const at = src.indexOf(String(fn));
  return at < 0 ? 0 : lineAt(src, at);
}

/** The 1-based line holding offset `pos`. @param {string} src @param {number} pos */
export function lineAt(src, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}
