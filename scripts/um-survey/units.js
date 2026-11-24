// Splits a book sketch into its top-level units and turns a function unit into the single arrow function
// that kit/parse reads. The sketches keep every top-level statement at column 0 and indent bodies, so a unit runs
// from one column-0 statement to the next; that is checked by the survey's parse-failure count, not assumed.

/**
 * @typedef {object} Unit
 * @property {"function" | "other"} kind
 * @property {string} name   `lerp`, or `exports.frag` for an assignment to exports
 * @property {string} text   the unit's source, without trailing blank or comment lines
 * @property {number} line   1-based line of its first line within the sketch
 */

const START = /^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(exports\.\w+)\s*=)/;

/** @param {string} src @returns {Unit[]} */
export function topLevelUnits(src) {
  const lines = src.split("\n");
  /** @type {{ name: string, from: number, to: number }[]} */
  const spans = [];
  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i]);
    if (!m) continue;
    if (spans.length) spans[spans.length - 1].to = i;
    spans.push({ name: m[1] ?? m[2] ?? m[3], from: i, to: lines.length });
  }
  return spans.flatMap(({ name, from, to }) => {
    let end = to;
    while (end > from + 1 && (lines[end - 1].trim() === "" || lines[end - 1].startsWith("//"))) end--;
    const text = lines.slice(from, end).join("\n");
    const parts = /^(?:const|let|var)\s/.test(text) ? splitDeclarators(text) : [{ name, text }];
    return parts.map((p) => ({ kind: asArrow({ kind: "other", name: p.name, text: p.text, line: from + 1 }) === null ? "other" : "function", name: p.name, text: p.text, line: from + 1 }));
  });
}

/**
 * `const a = 1, b = (x) => x;` as one `const name = init` text per declarator. Commas inside brackets,
 * strings and comments do not split. A declaration the scan cannot read is returned whole.
 * @param {string} text @returns {{ name: string, text: string }[]}
 */
function splitDeclarators(text) {
  const kw = /^(const|let|var)\s+/.exec(text);
  if (!kw) return [{ name: "?", text }];
  const body = text.slice(kw[0].length).replace(/;[ \t]*(\/\/.*)?$/, "");
  /** @type {string[]} */ const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < body.length && body[i] !== c; i++) if (body[i] === "\\") i++;
    } else if (c === "/" && body[i + 1] === "/") {
      while (i < body.length && body[i] !== "\n") i++;
    } else if (c === "/" && body[i + 1] === "*") {
      i = body.indexOf("*/", i + 2);
      if (i < 0) break;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) { parts.push(body.slice(from, i)); from = i + 1; }
  }
  parts.push(body.slice(from));
  return parts.map((p) => {
    const t = p.trim();
    return { name: /^(\w+)/.exec(t)?.[1] ?? "?", text: `${kw[1]} ${t};` };
  });
}

/** Index of the `)` matching the `(` at `open`. @param {string} s @param {number} open */
function closeParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * The unit as one arrow function expression, or null when it is not a function.
 * A declaration `function f(a) { … }` becomes `(a) => { … }`; an arrow initializer loses its binding and `;`.
 * @param {Unit} unit @returns {string | null}
 */
export function asArrow(unit) {
  const t = unit.text;
  let m = /^function\s+\w+\s*\(/.exec(t);
  if (m) {
    const open = m[0].length - 1, close = closeParen(t, open);
    const body = close < 0 ? -1 : t.indexOf("{", close);
    return body < 0 ? null : `(${t.slice(open + 1, close)}) => ${t.slice(body)}`;
  }
  const eq = /^(?:(?:const|let|var)\s+\w+|exports\.\w+)\s*=\s*/.exec(t);
  if (!eq) return null;
  const init = t.slice(eq[0].length).replace(/;[ \t]*(\/\/.*)?$/, "");
  m = /^function\s*\(/.exec(init);
  if (m) {
    const open = m[0].length - 1, close = closeParen(init, open);
    const body = close < 0 ? -1 : init.indexOf("{", close);
    return body < 0 ? null : `(${init.slice(open + 1, close)}) => ${init.slice(body)}`;
  }
  if (init.startsWith("(")) {
    const close = closeParen(init, 0);
    return close >= 0 && /^\s*=>/.test(init.slice(close + 1)) ? init : null;
  }
  return /^\w+\s*=>/.test(init) ? init : null;
}
