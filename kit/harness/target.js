// The comparison figure the harness holds a target to. It is declared by the Dialect's target
// (`targets.<name>.compare`), not here: the harness only reads it, and a case may override it for a stated reason.

import { FIELDS_DIALECT } from "../dialects/fields/index.js";

/** @import { Case, Override } from "./cases.js" */

/**
 * The figure a target's compare mode asks for: 0 for `exact` (identical bits), the declared figure for `tolerance`.
 * @param {{ targets: Record<string, { compare: { kind: "exact" } | { kind: "tolerance", figure: number } }> }} dialect
 * @param {string} target
 * @returns {number}
 */
export function targetFigure(dialect, target) {
  const compare = dialect.targets[target]?.compare;
  if (!compare) throw new Error(`The Dialect declares no '${target}' target, so there is no figure to compare it by.`);
  return compare.kind === "exact" ? 0 : compare.figure;
}

/** The figure the fields Dialect's GLSL target declares. */
export const glslFigure = () => targetFigure(FIELDS_DIALECT, "glsl");

/**
 * The figure a case's GLSL pair is held to: the target's, or the case's own override, which must say why.
 * @param {Case} c
 * @returns {{ figure: number, override: Override | null }}
 */
export function figureFor(c) {
  const o = c.override;
  if (o === undefined || o === null) return { figure: glslFigure(), override: null };
  if (typeof o.reason !== "string" || o.reason.trim() === "") throw new Error(`Case '${c.name}': a figure override must state its reason (override: { figure, reason }); without one it is a looser figure nobody can question.`);
  if (typeof o.figure !== "number" || !(o.figure > 0) || !Number.isFinite(o.figure)) throw new Error(`Case '${c.name}': the figure override must be a positive number, got ${String(o.figure)}.`);
  return { figure: o.figure, override: o };
}
