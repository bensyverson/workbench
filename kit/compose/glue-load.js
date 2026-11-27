// A glue program loaded (review M2, M4.4: the page host used to decide these). Importing the module is the host's,
// since the kit's modules hold no dynamic import: `rewriteGlue` gives the text to import, its specifiers replaced by
// the URLs the host made, and `callGlue` calls the imported default export and says what it made. A glue's `$` has
// no params (each part keeps its own, read inside the part's lambdas), so build-time code that reads it is S104,
// never `undefined`.

import { scanGlue, GLUE_SPECIFIERS } from "./glue.js";
import { isComposition } from "./compose.js";
import { glueSite } from "./site.js";

/** @import { Loc } from "../parse/ast.js" */

/** @typedef {{ code: string, severity: "error" | "warning", message: string, fix?: string, file?: string, line?: number, loc?: Loc }} GlueLoadDiagnostic */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));
const SHAPE = 'export default ($) => compose("name").part(…)…';
/** A kit diagnostic code: a letter and three digits. */
const KIT_CODE = /^[A-Z]\d{3}$/;

/**
 * A glue's text with each import's specifier replaced by its module's URL: `urls` maps `kit/compose`, `kit/define`
 * and each package's name to a URL (a package's is its Grammar entry's). What `scanGlue` refuses comes back as
 * diagnostics with no text. Throws when `urls` lacks a name the glue may import: the host's mistake.
 * @param {string} text @param {Record<string, string>} urls @param {string} [path]
 * @returns {{ text: string | null, diagnostics: GlueLoadDiagnostic[] }}
 */
export function rewriteGlue(text, urls, path = "workbench.js") {
  const packages = Object.keys(urls).filter((n) => !GLUE_SPECIFIERS.includes(n));
  const scanned = scanGlue(text, packages, path);
  if (scanned.diagnostics.length) return { text: null, diagnostics: /** @type {GlueLoadDiagnostic[]} */ (scanned.diagnostics) };
  let out = text;
  for (const i of [...scanned.imports].sort((a, b) => b.start - a.start)) {
    const name = i.resolved ?? i.specifier;
    const url = Object.hasOwn(urls, name) ? urls[name] : undefined;
    if (typeof url !== "string") throw new TypeError(`rewriteGlue: no URL for '${name}' (${path}:${i.line}); urls maps kit/compose, kit/define and each package's name to its module`);
    out = out.slice(0, i.start) + url + out.slice(i.end);
  }
  return { text: out, diagnostics: [] };
}

/**
 * The glue's `$`: every read refused (S104), each refusal kept so a glue that catches one still fails.
 * @param {GlueLoadDiagnostic[]} refusals @param {string} path
 */
function glueParams(refusals, path) {
  /** @param {string} how */
  const refuse = (how) => {
    const at = glueSite();
    const d = /** @type {GlueLoadDiagnostic} */ ({ code: "S104", severity: "error", message: `the glue's build-time code reads ${how}, and a glue has no params: each part keeps its own`, fix: "read the param inside the part's lambda ((…) => $.name), or write the value in the glue", file: path, loc: at.loc, line: at.loc.start.line });
    refusals.push(d);
    return Object.assign(new Error(`S104 ${d.message}`), { code: "S104" });
  };
  return new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol") { if (prop === Symbol.toPrimitive) throw refuse("$ as a value"); return undefined; }
      throw refuse(`$.${prop}`);
    },
    has(_t, prop) { throw refuse(`"${String(prop)}" in $`); },
    ownKeys() { throw refuse("$ as a whole (a spread, Object.keys or JSON.stringify)"); },
    getOwnPropertyDescriptor(_t, prop) { throw refuse(`$.${String(prop)}`); },
    set() { throw refuse("$ to write it"); },
  });
}

/**
 * Calls a glue's default export with the glue's `$`: the composition, or why there is none. A build-time read of
 * `$` is S104; an export that is not a function, throws, or returns something other than a composition is S103; a
 * thrown error that carries kit diagnostics (`diagnostics`) or a kit code (`code`, such as a handle's S301) keeps them.
 * @param {unknown} exported  the module's default export @param {string} [path]  how messages name the file
 * @returns {{ composition: any, diagnostics: GlueLoadDiagnostic[] }}
 */
export function callGlue(exported, path = "workbench.js") {
  /** @param {string} message @returns {{ composition: null, diagnostics: GlueLoadDiagnostic[] }} */
  const refused = (message) => ({ composition: null, diagnostics: [{ code: "S103", severity: "error", message, fix: SHAPE, file: path }] });
  if (typeof exported !== "function") return refused(`${path}'s default export is ${exported === undefined ? "missing" : `${typeof exported}, not a function`}: a glue is a function ($) => composition`);
  /** @type {GlueLoadDiagnostic[]} */
  const refusals = [];
  /** @type {unknown} */
  let out;
  try { out = exported(glueParams(refusals, path)); } catch (e) {
    if (refusals.length) return { composition: null, diagnostics: refusals };
    const ds = /** @type {any} */ (e)?.diagnostics;
    if (Array.isArray(ds) && ds.length) return { composition: null, diagnostics: ds.map((d) => ({ ...d, severity: d.severity === "warning" ? "warning" : "error", file: d.file ?? path })) };
    const code = /** @type {any} */ (e)?.code;
    if (typeof code === "string" && KIT_CODE.test(code)) return { composition: null, diagnostics: [{ code, severity: "error", message: messageOf(e), file: path }] };
    return refused(`${path}'s default export threw: ${messageOf(e)}`);
  }
  if (refusals.length) return { composition: null, diagnostics: refusals };
  if (!isComposition(out)) return refused(`${path}'s default export returned ${out === undefined ? "nothing" : out instanceof Promise ? "a Promise" : "something that is not a composition"}: a glue returns compose(…)…, built synchronously`);
  return { composition: out, diagnostics: [] };
}
