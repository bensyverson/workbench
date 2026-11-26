// What every pairing's legs share: number and point text, a run's N diagnostics as findings (errors) and as notes
// (warnings, which never fail a leg), and an example built at its params' declared values.

import { run as runProgram } from "../../../kit/define/index.js";
import { buildOptions } from "../../pkg-trial/checker/scope.js";

/** @typedef {import("./load.js").Found} Found */
/** @typedef {{ diagnostics: Found[], plan: string[], notes: string[] }} LegResult */

/** @param {number} v */
export const num = (v) => String(Math.round(v * 1000) / 1000);
/** @param {unknown} p */
export const pointText = (p) => (Array.isArray(p) ? `(${p.map((v) => num(v)).join(", ")})` : num(/** @type {number} */ (p)));

/** @param {any} d */
const isWarning = (d) => d.severity === "warning";
/** @param {any} d */
const at = (d) => (d.T !== undefined ? ` (at T = ${d.T})` : "");

/**
 * A run's N errors as findings at `file`; its warnings are left to `runWarnings`.
 * @param {any[]} diagnostics @param {(part?: string) => string} fileOf @param {string} [what]
 * @returns {Found[]}
 */
export const runFindings = (diagnostics, fileOf, what = "") => diagnostics.filter((d) => !isWarning(d)).map((d) => ({ file: fileOf(d.part), line: 1, code: d.code, message: `${what}${d.message}${at(d)}`, fix: "see runtime.md, \"The rules a step keeps\"" }));

/**
 * A run's warnings (N001: a slow run, records dropped by a policy) as note lines, which do not fail a leg.
 * @param {any[]} diagnostics @param {(part?: string) => string} fileOf @param {string} [what]
 * @returns {string[]}
 */
export const runWarnings = (diagnostics, fileOf, what = "") => diagnostics.filter(isWarning).map((d) => `${fileOf(d.part)}:1: ${d.code} (warning) ${what}${d.message}${at(d)}`);

/**
 * An example's builder, built at its params' declared values, and its build options.
 * @param {(path: string) => Promise<any>} importModule @param {string} path
 */
export async function exampleOf(importModule, path) {
  const mod = await importModule(path);
  const build = buildOptions(path, mod);
  const built = runProgram(mod.default, build);
  const values = Object.fromEntries(Object.entries(built.record?.params ?? {}).map(([k, v]) => [k, /** @type {any} */ (v).value]));
  return { builder: mod.default(Object.freeze(values)), record: built.record, build };
}
