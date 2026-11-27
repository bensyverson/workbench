// The module scope of a Program file (an example, a glue): its lambdas read the file's top-level constants and
// helpers, and only the module's own code can say what those are. The kit has no module loader, so a host appends an
// epilogue to the module's text that exports them (`withScope`), imports it its own way, and builds the BuildOptions
// `.build` takes from that export and the text (`moduleScope`). No Node built-ins: the page host and the define
// trial's checker both use it. What the options mean is README.md's "Module scope".

import { topLevelNames, topLevelBindings, topLevelFunctions, buildTimeNames, buildTimeBindings, ScanError } from "../parse/toplevel.js";

/** @import { BuildOptions } from "./define.js" */

/** The export the epilogue adds: a function returning the file's top-level bindings. */
export const SCOPE_EXPORT = "__moduleScope";
/** The export that returns each top-level function declaration's value as it was before any module code ran. */
export const FUNCTIONS_EXPORT = "__moduleFunctions";

/** A whole string that is one name. */
const IDENT = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
/** Words that cannot be read as a name. */
const RESERVED = new Set(["default", "enum", "await", "yield", "let", "static", "implements", "interface", "package", "private", "protected", "public", "arguments", "eval"]);

/**
 * The text with an epilogue that exports its top-level bindings. The epilogue comes last (and the one capture of
 * function declarations is on line 1, with no newline), so every line keeps its number. A file the scan cannot read is
 * returned as it is: the engine then reports its own syntax error.
 * @param {string} text
 */
export function withScope(text) {
  // A name the module has not bound when the epilogue runs (a `let` still in its TDZ) is left out, not thrown.
  /** @type {string[]} */
  let all;
  try { all = topLevelNames(text); } catch (e) { if (e instanceof ScanError) return text; throw e; }
  const names = all.filter((n) => IDENT.test(n) && !RESERVED.has(n));
  // The epilogue's own local must not shadow a binding it reads.
  let out = "__scope";
  while (names.includes(out)) out += "_";
  const reads = names.map((n) => `try { ${out}.${n} = ${n}; } catch {}`).join(" ");
  // A function declaration is initialized before any module code runs and is reassignable, so its text vouches for
  // nothing; its value captured on line 1 is what the scope is held to.
  /** @type {string[]} */
  let fns = [];
  try { fns = topLevelFunctions(text).map((f) => f.name).filter((n) => IDENT.test(n) && !RESERVED.has(n)); } catch (e) { if (!(e instanceof ScanError)) throw e; }
  let cap = "__fns";
  while (names.includes(cap)) cap += "_";
  const head = fns.length ? `const ${cap} = { ${[...new Set(fns)].map((n) => `${n}: ${n}`).join(", ")} };` : "";
  const tail = `export function ${FUNCTIONS_EXPORT}() { return ${fns.length ? cap : "{}"}; }`;
  return `${head}${text}\n;export function ${SCOPE_EXPORT}() { const ${out} = {}; ${reads} return ${out}; }\n${tail}\n`;
}

/**
 * Each top-level `const` declaration's initializer text and each function declaration's text, by name: what
 * vouches for a helper. A `let`'s does not, since the binding may be reassigned to an arrow made by other code with
 * the same text. Throws ScanError when the scan misreads the file (a name declared twice, which a module cannot do).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function helperSources(text) {
  return Object.fromEntries([...topLevelBindings(text).filter((b) => b.keyword === "const"), ...topLevelFunctions(text)].map((b) => [b.name, b.init]));
}

/**
 * The build options for a module imported from `withScope(text)`: its top-level bindings (from the epilogue's
 * export; none when `mod` lacks it), each helper's source, each binding's keyword, the names its text declares
 * only inside build-time code, and the text itself as `file`, on which the builder runs the shadow scan (it knows
 * which lambdas it was handed, so a lambda's own parameter shadows nothing). Throws ScanError when the file's top level cannot be read: no declaration can then
 * vouch for a helper, so a host reports it rather than build with either reading (fail closed).
 * @param {string} text  the module's original text
 * @param {Record<string, any>} mod  the imported module
 * @returns {BuildOptions}
 */
export function moduleScope(text, mod) {
  const sources = helperSources(text);
  const scope = typeof mod[SCOPE_EXPORT] === "function" ? mod[SCOPE_EXPORT]() : {};
  const captured = typeof mod[FUNCTIONS_EXPORT] === "function" ? mod[FUNCTIONS_EXPORT]() : {};
  // A function declaration's text vouches only while the binding still holds the function the declaration made.
  for (const f of topLevelFunctions(text)) if (!Object.hasOwn(captured, f.name) || scope[f.name] !== captured[f.name]) delete sources[f.name];
  const keywords = Object.fromEntries([...topLevelBindings(text).map((b) => [b.name, b.keyword]), ...topLevelFunctions(text).map((f) => [f.name, "function"])]);
  return { scope, sources, buildTime: buildTimeNames(text), buildTimeBindings: buildTimeBindings(text), keywords, file: text };
}
