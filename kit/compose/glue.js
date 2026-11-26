// A glue program's imports, read from its syntax tree before it runs, by kit/package's own scan: it may import
// "kit/compose", "kit/define" and the workbench's packages by their names (`import { maze } from "maze"`), nothing
// else, and no dynamic import expression. The host resolves each package name to that package's Grammar entry
// (what kit/package's loadPackage loaded), so there is no second resolver.

import { scanImports } from "../package/imports.js";

/** The specifiers every glue program may import besides its packages. */
export const GLUE_SPECIFIERS = Object.freeze(["kit/compose", "kit/define"]);

/**
 * @param {string} text  the glue program's source @param {string[]} packages  the workbench's package names
 * @param {string} [path]  how messages name the file
 * @returns {ReturnType<typeof scanImports>}  each import's `resolved` is its bare name; refusals are kit/package's K007
 */
export function scanGlue(text, packages, path = "workbench.js") {
  return scanImports(path, text, [], { bare: [...GLUE_SPECIFIERS, ...packages], who: "a glue program" });
}
