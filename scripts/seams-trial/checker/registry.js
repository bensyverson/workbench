// What the stand-ins learn as a hand-in loads, shared with the checker: each Dialect's seams, each generated
// builder's and each Program's, the refusals the stand-in's define calls threw (so the checker can place their D
// codes at lines), the handles read as values (S301), and the packages, to name a Dialect's version.

/** @import { Seams } from "./ports.js" */

/** The seams of each Dialect the stand-in's defineDialect made, the file that defined it, and its declaration. @type {WeakMap<object, { seams: Seams, file: string, decl: unknown }>} */
export const dialects = new WeakMap();
/** The Dialect and seams behind each builder the stand-in's defineGrammar made. @type {WeakMap<Function, { dialect: any, seams: Seams, grammar: Record<string, any> }>} */
export const builders = new WeakMap();
/** The builder each Program was opened with. @type {WeakMap<object, Function>} */
export const programs = new WeakMap();

export const registry = {
  /** Each refusal the stand-in's defineDialect or defineGrammar threw: the declaration, for placing its paths. @type {Array<{ what: string, decl: unknown, diagnostics: Array<{ code: string, path: Array<string | number>, message: string, tip: string, file?: string, line?: number }> }>} */
  refusals: [],
  /** Each seam problem a Grammar's lower(record) found (port-lower.js), with the Dialect's file and declaration, for placing at its port or frame. @type {Array<{ diagnostic: import("./port-lower.js").PortDiagnostic, file: string, decl: unknown }>} */
  seamLowerings: [],
  /** Each handle read as a value at build time: where, and which. @type {Array<{ file: string, line: number, handle: string }>} */
  valueReads: [],
  /** The hand-in folder (a file URL ending in /), for placing S301; "" when none. */
  dirUrl: "",
  /** The packages of this check, each with its folder as a file URL ending in /. @type {Array<{ dirUrl: string, name: string, version: string }>} */
  packages: [],
};

/** Starts a check. @param {string} dirUrl */
export function resetRegistry(dirUrl) {
  registry.refusals = [];
  registry.seamLowerings = [];
  registry.valueReads = [];
  registry.dirUrl = dirUrl;
  registry.packages = [];
}

/** The package a file (a URL) belongs to, by folder. @param {string} file */
export function packageOf(file) {
  const bare = file.replace(/\?.*$/, "");
  return registry.packages.filter((p) => bare.startsWith(p.dirUrl)).sort((a, b) => b.dirUrl.length - a.dirUrl.length)[0] ?? null;
}
