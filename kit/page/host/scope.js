// The module scope of a Program file (a glue or an example): its lambdas read the file's top-level constants and
// helpers, and only the module's own code can say what those are. The kit has no module loader, so the host
// appends an epilogue to the module's text that exports them, and builds kit/define's `BuildOptions` from that
// export and the file's text. This is the define trial's checker, ported to the page (kit/define's README,
// "Module scope"); it holds no decision of its own.

import { topLevelNames, topLevelBindings, topLevelFunctions, buildTimeNames, buildTimeBindings, buildTimeShadows, ScanError } from "../../parse/toplevel.js";

/** The exports the epilogue adds. */
export const SCOPE_EXPORT = "__hostScope";
export const FUNCTIONS_EXPORT = "__hostFunctions";

const IDENT = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
const RESERVED = new Set(["default", "enum", "await", "yield", "let", "static", "implements", "interface", "package", "private", "protected", "public", "arguments", "eval"]);

/**
 * The text with an epilogue (last, so every line keeps its number) that exports its top-level bindings. A file the
 * scan cannot read is returned as it is: the engine then reports its own syntax error.
 * @param {string} text
 */
export function withScope(text) {
  /** @type {string[]} */
  let all;
  try { all = topLevelNames(text); } catch (e) { if (e instanceof ScanError) return text; throw e; }
  const names = all.filter((n) => IDENT.test(n) && !RESERVED.has(n));
  let out = "__scope";
  while (names.includes(out)) out += "_";
  const reads = names.map((n) => `try { ${out}.${n} = ${n}; } catch {}`).join(" ");
  // a function declaration is initialized before any module code runs, so its value is captured on line 1
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
 * kit/define's build options for a module that went through `withScope`. A file whose top level cannot be read
 * throws a `ScanError` (the host reports it as a diagnostic).
 * @param {string} text  the module's original text
 * @param {Record<string, any>} mod  the imported module
 * @returns {import("../../define/define.js").BuildOptions}
 */
export function moduleScope(text, mod) {
  const sources = Object.fromEntries([...topLevelBindings(text).filter((b) => b.keyword === "const"), ...topLevelFunctions(text)].map((b) => [b.name, b.init]));
  const scope = typeof mod[SCOPE_EXPORT] === "function" ? mod[SCOPE_EXPORT]() : {};
  const captured = typeof mod[FUNCTIONS_EXPORT] === "function" ? mod[FUNCTIONS_EXPORT]() : {};
  // a function declaration's text vouches only while its binding still holds the function the declaration made
  for (const f of topLevelFunctions(text)) if (!Object.hasOwn(captured, f.name) || scope[f.name] !== captured[f.name]) delete sources[f.name];
  const keywords = Object.fromEntries([...topLevelBindings(text).map((b) => [b.name, b.keyword]), ...topLevelFunctions(text).map((f) => [f.name, "function"])]);
  return { scope, sources, buildTime: buildTimeNames(text), buildTimeBindings: buildTimeBindings(text), keywords, shadowed: buildTimeShadows(text) };
}
