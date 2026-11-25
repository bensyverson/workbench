// One check's state, shared by the module hooks, the defineUI stand-in and the checker. One check runs at a time.

/** @import { UIDiagnostic } from "./codes.js" */

export const session = {
  /** The hand-in directory as a file URL ending in "/", or "" between checks. */
  dirUrl: "",
  /** Bumped per check, so a second check of one directory loads its files afresh. */
  run: 0,
  /** Each defineUI call: its arguments and the kit's refusal of it, if any. @type {Array<{ builder: unknown, decl: unknown, refusal: import("../../../kit/define/dialect.js").DefinitionError | null }>} */
  calls: [],
  /** What a hand-in's `module` paths read: a package file's text, or null when it is not a readable file. @type {(path: string) => string | null} */
  moduleText: () => null,
  /** Imports the hooks refused: the importing file's URL and the specifier. @type {Array<{ parentURL: string, specifier: string }>} */
  imports: [],
  /** The hand-in files its own files imported, as URLs without the query. @type {Set<string>} */
  loaded: new Set(),
  /** @type {UIDiagnostic[]} */
  diagnostics: [],
};

/** Starts a check of the directory at `dirUrl`. @param {string} dirUrl */
export function begin(dirUrl) {
  session.dirUrl = dirUrl;
  session.run++;
  session.calls = [];
  session.imports = [];
  session.loaded = new Set();
  session.diagnostics = [];
}
