// The custom element rules (U008): what a tag may look like, and whether a module's code defines it.

import { blank } from "../../../kit/parse/blank.js";

/**
 * A custom element tag under the package prefix: lowercase, with a hyphen, a non-empty name after `<package>-`
 * (ui-draft.md, "Custom elements"). HTML's valid-custom-element-name also allows `.` and `_` after the first
 * letter, and the draft does not narrow that, so neither does this. Non-ASCII name characters are not allowed.
 * @param {unknown} tag @param {string} prefix  the package name, lowercased, with its hyphen
 * @returns {tag is string}
 */
export function tagOk(tag, prefix) {
  return typeof tag === "string" && tag.startsWith(prefix) && tag.length > prefix.length && /^[a-z][-._0-9a-z]*$/.test(tag);
}

/** The text of a string literal starting at `at` in `text` (a quote of `"`, `'` or `` ` ``; no escapes), or null. @param {string} text @param {number} at */
function literalAt(text, at) {
  const q = text[at];
  if (q !== '"' && q !== "'" && q !== "`") return null;
  const end = text.indexOf(q, at + 1);
  return end < 0 ? null : text.slice(at + 1, end);
}

/**
 * Whether `text` is code that calls `customElements.define(<tag>, …)`: a comment or a string that merely holds the
 * call does not count, and the name may be a top-level `const` bound to the tag string. This is a lexical read
 * (kit/parse's `blank` hides comments, strings and regexes), not an evaluation: an element defined through a
 * computed name, a loop or a helper function is not found, and the tag is then reported as not defined.
 * @param {string} text @param {string} tag
 */
export function definesTag(text, tag) {
  const code = blank(text);
  /** The brace depth of each offset is counted lazily, only for the consts a call names. */
  const depthAt = (/** @type {number} */ pos) => {
    let d = 0;
    for (let i = 0; i < pos; i++) if (code[i] === "{" || code[i] === "(" || code[i] === "[") d++; else if (code[i] === "}" || code[i] === ")" || code[i] === "]") d--;
    return d;
  };
  for (const m of code.matchAll(/(?<![\w$])customElements\s*\.\s*define\s*\(\s*/g)) {
    const arg = m.index + m[0].length;
    if (literalAt(text, arg) === tag && '"`'.includes(code[arg])) return true;
    const id = /^[A-Za-z_$][\w$]*/.exec(code.slice(arg));
    if (!id || !/^\s*,/.test(code.slice(arg + id[0].length))) continue;
    const decl = new RegExp(`(?<![\\w$.])const\\s+${id[0].replace(/\$/g, "\\$")}\\s*=\\s*`, "g");
    for (const d of code.matchAll(decl)) {
      const at = d.index + d[0].length;
      if (depthAt(d.index) === 0 && literalAt(text, at) === tag && '"`'.includes(code[at])) return true;
    }
  }
  return false;
}
