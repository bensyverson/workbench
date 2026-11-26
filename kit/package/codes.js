// The package module's codes: K… is a Dialect package refused (its manifest, its files, its imports or what its
// entry modules export). Each diagnostic carries a message and a fix.

/** Each code and what it means; the tests check that every one is exercised. */
export const PACKAGE_CODES = Object.freeze({
  K001: "No wb-package.json, or one that is not a JSON object",
  K002: "A manifest field that is missing, unknown or the wrong shape (a glob, a path that is not a normalized relative path or names a dotfile, a module path that does not end in .js, a bad name, version, kit, hash or refusal code, a module that is both an example and a refusal)",
  K003: "A package written for another Definition API version than the kit's",
  K004: "A file the manifest names (in files, entry, lib, foreign, elements, examples or refusals) that the package does not hold",
  K005: "A file in the package that the manifest's files does not list",
  K006: "A file whose hash is not the one the manifest lists: it changed after the package was hashed",
  K007: "An import other than \"kit/define\" or an existing .js file of the package: a bare name, a built-in, a URL, a missing or outside file, or any dynamic import expression",
  K008: "An entry module that does not export exactly one definition of its kind, or definitions that do not fit: the Dialect's name is not the package's, the Grammar is not built on the Dialect, the UI not on the Grammar",
  K009: "Modules that import each other in a cycle, so no order of blob: URLs can resolve them",
  K010: "A bundle that is not { \"format\": \"wb-bundle\", \"files\": { path: text } }",
  K011: "An entry, example or refusal module that failed to import",
  K012: "An example that is refused when built or lowered, or an example or refusal module whose default export is not a function of the params that builds a Program",
  K013: "A refusal that is accepted: its Program builds and lowers clean",
  K014: "A refusal that is refused with a different code than the manifest gives",
  K015: "A custom element module the UI names that the manifest's elements does not list",
  K016: "A module the manifest's elements lists that no custom element in the UI names",
});

/**
 * One refusal. `file` and `line` are present when the problem is in a file of the package.
 * @param {keyof typeof PACKAGE_CODES} code @param {string} message @param {string} fix @param {string} [file] @param {number} [line]
 * @returns {import("./package.js").PackageDiagnostic}
 */
export function diag(code, message, fix, file, line) {
  return { code, severity: "error", message, fix, ...(file !== undefined ? { file } : {}), ...(line !== undefined ? { line } : {}) };
}
