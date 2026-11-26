// A lexical scan of a package module's imports, run before the module does. The kit's `blank` (kit/parse) turns
// comments, strings, regexes and template text into spaces, so what is left is code at its own offsets; the
// scan finds `import`/`export … from` there and reads the specifier from the original text.

import { blank } from "../parse/blank.js";
import { diag } from "./codes.js";
import { isModulePath, resolveRelative } from "./paths.js";

export const KIT_SPECIFIER = "kit/define";

/** What follows `import` in a static import: a clause, then `from` and a string. */
const IMPORT_CLAUSE = /^(?:[^"';(){}]|\{[^}]*\})*?\bfrom\s*"/;
/** `import` then `.` then a word: what follows a dot after `import`. Only `meta` is allowed. */
const IMPORT_DOT = /^\.\s*([\p{ID_Continue}$]*)/u;
/** What follows `export` in a re-export of everything. */
const EXPORT_STAR = /^\*\s*(?:as\s+[^\s"';]+\s*)?from\s*"/;
/** What follows `export {…}` in a re-export. */
const FROM_STRING = /^\s*from\s*"/;

/**
 * Finds the static imports and re-exports of a module and refuses what a package may not import: anything but
 * `kit/define` and a relative path to a file of the package, and every dynamic `import()`.
 * @param {string} path  the module's path in the package
 * @param {string} text
 * @param {Iterable<string>} files  the package's file paths, for the existence check
 * @returns {{ imports: import("./package.js").ModuleImport[], diagnostics: import("./package.js").PackageDiagnostic[] }}
 */
export function scanImports(path, text, files) {
  const have = new Set(files);
  const code = blank(text);
  /** @type {import("./package.js").ModuleImport[]} */
  const imports = [];
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const diagnostics = [];
  const lineAt = (/** @type {number} */ at) => { let n = 1; for (let i = text.indexOf("\n"); i >= 0 && i < at; i = text.indexOf("\n", i + 1)) n++; return n; };
  for (const m of code.matchAll(/(?<![\p{ID_Continue}$])(import|export)(?![\p{ID_Continue}$])/gu)) {
    // The keyword after a single dot (whitespace and comments allowed between) is a property name; after `...` it is the keyword.
    const before = code.slice(0, m.index).trimEnd();
    if (before.endsWith(".") && !before.endsWith("...")) continue;
    const kw = m[1];
    const after = m.index + kw.length;
    const rest = code.slice(after);
    const lead = rest.length - rest.trimStart().length;
    const tail = rest.slice(lead);
    let quote = -1;
    if (kw === "import") {
      if (tail.startsWith("(")) {
        diagnostics.push(diag("K007", `${path} uses a dynamic import expression, which a package may not`, `import the module statically, with a relative path or "${KIT_SPECIFIER}"`, path, lineAt(m.index)));
        continue;
      }
      if (tail.startsWith(".")) {
        if (IMPORT_DOT.exec(tail)?.[1] !== "meta") diagnostics.push(diag("K007", `${path} uses import.${IMPORT_DOT.exec(tail)?.[1] ?? ""}, which a package may not; only import.meta is allowed`, `import the module statically, with a relative path or "${KIT_SPECIFIER}"`, path, lineAt(m.index)));
        continue;
      }
      if (tail.startsWith('"')) quote = after + lead;
      else { const c = IMPORT_CLAUSE.exec(tail); if (c) quote = after + lead + c[0].length - 1; }
    } else if (tail.startsWith("*")) {
      const c = EXPORT_STAR.exec(tail);
      if (c) quote = after + lead + c[0].length - 1;
    } else if (tail.startsWith("{")) {
      const close = tail.indexOf("}");
      const c = close < 0 ? null : FROM_STRING.exec(tail.slice(close + 1));
      if (c) quote = after + lead + close + 1 + c[0].length - 1;
    }
    if (quote < 0) continue;
    const end = code.indexOf('"', quote + 1);
    if (end < 0) continue;
    const specifier = text.slice(quote + 1, end);
    const line = lineAt(m.index);
    /** @type {string | null} */
    let resolved = null;
    let why = "";
    if (specifier === KIT_SPECIFIER) resolved = KIT_SPECIFIER;
    else if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const to = resolveRelative(path, specifier);
      if (to === null) why = "leaves the package or is not a normalized path (no trailing \"/\" or empty part)";
      else if (!isModulePath(to)) why = `names ${to}, which does not end in ".js": a package's modules are exactly its .js files`;
      else if (!have.has(to)) why = `names ${to}, which is not a file of the package`;
      else resolved = to;
    } else why = `is not "${KIT_SPECIFIER}" or a relative path`;
    if (resolved === null) diagnostics.push(diag("K007", `${path} imports "${specifier}", which ${why}; a package imports only "${KIT_SPECIFIER}" and its own files`, `remove the import, or import a file of the package by a relative path ("./x.js")`, path, line));
    imports.push({ specifier, resolved, line, start: quote + 1, end });
  }
  return { imports, diagnostics };
}
