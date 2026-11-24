// Finds which runtime lambdas reach outside themselves to a binding the program
// declares at its top level (a helper function, a constant). Those lambdas cannot be
// re-evaluated from `String(fn)` alone: the closure is lost, so the M1 pipeline has to
// handle them separately and parse coverage over them is not like-for-like. A
// Definition API host uses `topLevelNames` and `buildTimeNames` to gather a Program
// file's module scope (kit/define/README.md, "Module scope"). No Node built-ins.
//
// This is a lexical scan, not a parser, and it errs toward flagging: it can report a
// reference that is really a shadowing local, never miss a real one it can see. The
// flat local scope means a parameter of an inner arrow hides a same-named top-level
// binding everywhere in the lambda (a possible miss, not seen in the 22 presets).

const IDENT = /[A-Za-z_$][\w$]*/y;

/**
 * Replaces comments and string/regex-free literal text with spaces, keeping `${}` expressions
 * of template literals, so identifiers inside strings are never read as references.
 * @param {string} src
 */
function stripLiterals(src) {
  let out = "";
  /** @type {number[]} */
  const templateDepth = []; // brace depth at which each open `${` was entered
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; out += " "; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      out += '""';
      continue;
    }
    if (c === "`" || (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === depth)) {
      if (c === "}") templateDepth.pop();
      i++;
      while (i < src.length && src[i] !== "`" && !(src[i] === "$" && src[i + 1] === "{")) { if (src[i] === "\\") i++; i++; }
      if (src[i] === "$") { templateDepth.push(depth); out += " ( "; i++; } else out += " ";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    out += c;
  }
  return out;
}

/**
 * The identifiers a binding pattern declares, starting at `i` in `s`: a plain name, or a
 * balanced `[...]` / `{...}` pattern (object keys before `:` are not bindings).
 * @param {string} s
 * @param {number} i
 * @returns {{ names: string[], end: number }}
 */
function bindingAt(s, i) {
  while (/\s/.test(s[i] ?? "")) i++;
  IDENT.lastIndex = i;
  const plain = IDENT.exec(s);
  if (plain) return { names: [plain[0]], end: i + plain[0].length };
  if (s[i] !== "[" && s[i] !== "{") return { names: [], end: i };
  let depth = 0, j = i;
  for (; j < s.length; j++) {
    if ("[{(".includes(s[j])) depth++;
    else if ("]})".includes(s[j])) { depth--; if (depth === 0) { j++; break; } }
  }
  const inner = s.slice(i, j);
  const names = [...inner.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*:)/g)].map((m) => m[1]);
  return { names, end: j };
}

/**
 * Every name a declaration statement starting after its keyword at `i` binds, including
 * later declarators (`let a = 1, b = 2`). Stops at `;` or a closing bracket at depth 0.
 * @param {string} s
 * @param {number} i
 */
function declaredNames(s, i) {
  const first = bindingAt(s, i);
  const names = [...first.names];
  let depth = 0;
  for (let j = first.end; j < s.length; j++) {
    const c = s[j];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === ";" && depth === 0) break;
    else if (c === "," && depth === 0) { const b = bindingAt(s, j + 1); names.push(...b.names); j = Math.max(j, b.end - 1); }
    else if (depth === 0 && /\b(?:of|in)\b/.test(s.slice(j, j + 3)) && /\s/.test(s[j - 1] ?? "")) break;
  }
  return names;
}

/**
 * The index after the string, template or comment that starts at `i`, or `i` when none does.
 * @param {string} s
 * @param {number} i
 * @returns {number}
 */
function skipLiteral(s, i) {
  const c = s[i];
  if (c === "/" && s[i + 1] === "/") { const e = s.indexOf("\n", i); return e < 0 ? s.length : e; }
  if (c === "/" && s[i + 1] === "*") { const e = s.indexOf("*/", i + 2); return e < 0 ? s.length : e + 2; }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < s.length && s[j] !== "`") {
      if (s[j] === "\\") j += 2;
      else if (s[j] === "$" && s[j + 1] === "{") j = scanTo(s, j + 2, (_, k, depth) => depth === 0 && s[k] === "}") + 1;
      else j++;
    }
    return j + 1;
  }
  return i;
}

/**
 * The index of the first character from `from` for which `stop` holds at bracket depth 0,
 * skipping literals and comments; `s.length` when none does.
 * @param {string} s
 * @param {number} from
 * @param {(s: string, i: number, depth: number) => boolean} stop
 * @returns {number}
 */
function scanTo(s, from, stop) {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const skipped = skipLiteral(s, i);
    if (skipped !== i) { i = skipped - 1; continue; }
    if (stop(s, i, depth)) return i;
    if ("([{".includes(s[i])) depth++;
    else if (")]}".includes(s[i])) depth--;
  }
  return s.length;
}

/** Where a top-level statement ends: a `;`, or a line break after which the next line starts at column 0 with a name. */
const statementEnd = (/** @type {string} */ s, /** @type {number} */ from) =>
  scanTo(s, from, (t, i, depth) => depth === 0 && (t[i] === ";" || (t[i] === "\n" && /^[A-Za-z_$]/.test(t.slice(i + 1, i + 2)))));

/**
 * @typedef {object} Binding
 * @property {string} name
 * @property {"const" | "let"} keyword
 * @property {string} init  The initializer's source text, exactly as written.
 */

/**
 * Each plain-named `const` and `let` a program declares at its top level, with its initializer's
 * source. A `const a = 1, b = 2` gives two. Destructuring declarations, `var` and functions are
 * not listed.
 * @param {string} code
 * @returns {Binding[]}
 */
export function topLevelBindings(code) {
  /** @type {Binding[]} */
  const out = [];
  let i = 0;
  while (i < code.length) {
    const skipped = skipLiteral(code, i);
    if (skipped !== i) { i = skipped; continue; }
    if (/\s/.test(code[i])) { i++; continue; }
    const end = statementEnd(code, i);
    const m = /^(?:export\s+)?(const|let)\s+/.exec(code.slice(i, end));
    if (m) {
      const bodyStart = i + m[0].length;
      let from = bodyStart;
      while (from <= end) {
        const comma = Math.min(scanTo(code, from, (t, k, depth) => depth === 0 && t[k] === ","), end);
        const part = code.slice(from, comma);
        const d = /^\s*([A-Za-z_$][\w$]*)\s*=\s*/.exec(part);
        if (d) out.push({ name: d[1], keyword: /** @type {"const" | "let"} */ (m[1]), init: part.slice(d[0].length).trim() });
        from = comma + 1;
      }
    }
    i = end + 1;
  }
  return out;
}

/**
 * The names a program declares at its top level (column 0): const, let, var and function.
 * @param {string} code
 * @returns {string[]}
 */
export function topLevelNames(code) {
  const s = stripLiterals(code);
  /** @type {string[]} */
  const names = [];
  for (const m of s.matchAll(/^(?:export\s+)?(?:async\s+)?(const|let|var|function\*?)\s+/gm)) {
    const at = (m.index ?? 0) + m[0].length;
    if (m[1].startsWith("function")) names.push(...bindingAt(s, at).names);
    else names.push(...declaredNames(s, at));
  }
  return names;
}

/**
 * The names a program declares only below its top level: `const`/`let`/`var` inside a block or function,
 * function names and parameters, arrow parameters, loop and `catch` variables. A Definition API host passes
 * them to the builder, so a Runtime Lambda that reads one (a closure over a build-time local) is told that it
 * cannot see it, rather than that the name is unknown. Like the rest of this scan it errs toward listing: a
 * name declared only inside another lambda is listed too.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeNames(code) {
  const s = stripLiterals(code);
  /** @type {Set<string>} */
  const names = new Set();
  const params = (/** @type {string} */ list) => { for (const part of splitTopLevel(list)) for (const n of bindingAt(part, 0).names) names.add(n); };
  for (const m of s.matchAll(/\b(?:const|let|var)\s+/g)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) names.add(n);
  for (const m of s.matchAll(/\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^()]*)\)/g)) { if (m[1]) names.add(m[1]); params(m[2]); }
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) params(m[1]);
  for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
  for (const m of s.matchAll(/\bcatch\s*\(([^()]*)\)/g)) params(m[1]);
  const top = new Set(topLevelNames(code));
  return [...names].filter((n) => !top.has(n));
}

/**
 * Which of `names` the lambda source `src` refers to, in the order `names` lists them.
 * Property names (`self.cell`), object keys (`{ cell: 1 }`), text in strings and comments, and
 * names the lambda itself declares (parameters, let/const/var, loop variables) do not count.
 * @param {string} src
 * @param {string[]} names
 * @returns {string[]}
 */
export function topLevelRefs(src, names) {
  const s = stripLiterals(src);
  /** @type {Set<string>} */
  const locals = new Set();
  for (const m of s.matchAll(/\b(?:const|let|var)\s+/g)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) locals.add(n);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of splitTopLevel(m[1])) for (const n of bindingAt(part, 0).names) locals.add(n);
  }
  for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) locals.add(m[1]);
  const wanted = new Set(names);
  /** @type {Set<string>} */
  const found = new Set();
  for (const m of s.matchAll(/(?<![\w$])[A-Za-z_$][\w$]*/g)) {
    const id = m[0], at = m.index ?? 0;
    if (!wanted.has(id) || locals.has(id)) continue;
    const before = s.slice(0, at).trimEnd();
    if (before.endsWith(".") && !before.endsWith("...")) continue; // member access
    if (/^\s*:/.test(s.slice(at + id.length)) && /[{,]$/.test(before)) continue; // object key
    found.add(id);
  }
  return names.filter((n, i) => found.has(n) && names.indexOf(n) === i);
}

/**
 * Splits on commas outside brackets.
 * @param {string} s
 */
function splitTopLevel(s) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    if ("([{".includes(s[i])) depth++;
    else if (")]}".includes(s[i])) depth--;
    else if (s[i] === "," && depth === 0) { parts.push(s.slice(from, i)); from = i + 1; }
  }
  parts.push(s.slice(from));
  return parts;
}
