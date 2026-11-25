// Effect strings and `may` patterns as a Dialect writes them: `verb`, `verb Obj` or `verb Obj.member`. A pattern
// matches every effect with its verb whose target is the same or inside it ("write Plant" matches
// `write Plant.height`; "read" matches every read); lowering does that match (kit/lower/lowerer.js).

/** The effect verbs a Dialect may name in `may`, a verb's `effects` or an object's call `effects`. */
export const VERBS = Object.freeze(["read", "write", "destroy", "rng", "bump"]);

/**
 * An effect or pattern taken apart; null when it is not `verb`, `verb Obj` or `verb Obj.member` (each name an identifier).
 * @param {unknown} s
 * @returns {{ verb: string, object?: string, member?: string } | null}
 */
export function parseEffect(s) {
  if (typeof s !== "string") return null;
  const m = /^([A-Za-z]+)(?: ([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?)?$/.exec(s);
  if (!m) return null;
  return { verb: m[1], ...(m[2] !== undefined ? { object: m[2] } : {}), ...(m[3] !== undefined ? { member: m[3] } : {}) };
}

/**
 * Whether two targets overlap: one is absent, or they name one object and one member of it is absent or both agree.
 * @param {{ object?: string, member?: string }} a @param {{ object?: string, member?: string }} b
 */
export function overlap(a, b) {
  if (a.object === undefined || b.object === undefined) return true;
  if (a.object !== b.object) return false;
  return a.member === undefined || b.member === undefined || a.member === b.member;
}
