// checkExamples: the package's examples are its regression suite. Each `examples` module is imported through the
// host's importer, built with kit/define's run() at the params' declared values and lowered by the Grammar; it
// must come out clean. Each `refusals` module goes the same way and must be refused with exactly its code.

import { DefinitionError, run } from "../define/index.js";
import { diag } from "./codes.js";

/** @typedef {{ code: string, severity?: string, message: string }} Found */

/** @param {unknown} e */
const messageOf = (e) => /** @type {Error} */ (e)?.message ?? String(e);

/**
 * What came of building one module's Program: the diagnostics that refuse it (none when it is clean), or why it
 * could not be built at all.
 * @param {any} grammar
 * @param {string} path
 * @param {Record<string, unknown>} mod
 * @param {import("../define/define.js").BuildOptions} options
 * @returns {{ refused: Found[] } | { broken: string }}
 */
function build(grammar, path, mod, options) {
  const fn = mod?.default;
  if (typeof fn !== "function") return { broken: `${path}'s default export is ${fn === undefined ? "missing" : "not a function"}; a Program is a function of its params, ($) => program("…")…` };
  /** @type {Found[]} */
  let found;
  try {
    const built = run(/** @type {(params: any) => unknown} */ (fn), options);
    found = built.diagnostics;
    if (built.record) found = grammar.lower(built.record).diagnostics;
  } catch (e) {
    // A refusal the Dialect makes while lowering (what environment(program) adds) is thrown as a DefinitionError.
    if (e instanceof DefinitionError) found = /** @type {Found[]} */ (/** @type {unknown} */ (e.diagnostics));
    else return { broken: `${path} threw when its Program was built: ${messageOf(e)}` };
  }
  return { refused: found.filter((d) => d.severity === undefined || d.severity === "error") };
}

/**
 * Builds every example and refusal of a loaded package. Returns the problems (K011 for a module that fails to
 * import, K012 for an example that is refused or not a Program, K013 for a refusal that is accepted, K014 for a
 * refusal refused with another code); empty when the package did not load or everything holds. A refusal is
 * matched by the code of the first diagnostic.
 * @param {import("./package.js").LoadedPackage} loaded
 * @param {{ importModule: (path: string) => Promise<Record<string, unknown>>, buildOptions?: (path: string, module: Record<string, unknown>) => import("../define/define.js").BuildOptions | null }} options
 *   `buildOptions` gives run() the module scope of a file (its top-level helpers, for lambdas that read them), which only the host can read
 * @returns {Promise<import("./package.js").PackageDiagnostic[]>}
 */
export async function checkExamples(loaded, { importModule, buildOptions }) {
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const out = [];
  const grammar = /** @type {any} */ (loaded.grammar);
  if (!grammar) return out;
  /** @param {string} path @returns {Promise<ReturnType<typeof build> | null>} null when it failed to import */
  const attempt = async (path) => {
    /** @type {Record<string, unknown>} */
    let mod;
    try { mod = await importModule(path); } catch (e) {
      out.push(diag("K011", `${path} failed to import: ${messageOf(e)}`, `fix the error in ${path}`, path));
      return null;
    }
    try { return build(grammar, path, mod, buildOptions?.(path, mod) ?? {}); } catch (e) {
      return { broken: `${path} could not be built: ${messageOf(e)}` };
    }
  };
  for (const path of loaded.examples) {
    const r = await attempt(path);
    if (r === null) continue;
    if ("broken" in r) out.push(diag("K012", r.broken, `write ${path} as export default ($) => program("…")…, with no error`, path));
    else if (r.refused.length) out.push(diag("K012", `the example ${path} is refused: ${r.refused[0].code} ${r.refused[0].message}`, `fix the example, or if it is meant to be refused, move it from "examples" to "refusals" with its code`, path));
  }
  for (const { module: path, code } of loaded.refusals ?? []) {
    const r = await attempt(path);
    if (r === null) continue;
    if ("broken" in r) out.push(diag("K012", r.broken, `write ${path} as export default ($) => program("…")…, the Program the kit must refuse with ${code}`, path));
    else if (!r.refused.length) out.push(diag("K013", `${path} is listed in "refusals" with ${code}, but its Program was accepted`, `make ${path} break the rule that gives ${code}, or remove it from "refusals"`, path));
    else if (r.refused[0].code !== code) out.push(diag("K014", `${path} is listed in "refusals" with ${code}, but the kit refused it with ${r.refused[0].code}: ${r.refused[0].message}`, `write "code": "${r.refused[0].code}" if that is the refusal meant, or change ${path} to break the rule that gives ${code}`, path));
  }
  return out;
}
