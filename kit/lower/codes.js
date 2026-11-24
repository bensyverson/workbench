// Lowering's diagnostic codes. The parser's are P… and S…; these are L…, and each
// diagnostic carries a one-line tip telling the author what to write instead.

/** Each code and what it means; the tests check that every one is exercised. */
export const LOWER_CODES = Object.freeze({
  L001: "A free identifier the environment does not declare, or a name read inside its own declaration",
  L002: "An unknown member",
  L003: "A type mismatch",
  L004: "An effect the slot does not allow",
  L005: "A callback that is not an argument to a declared query",
  L006: "A query callback with an effect, or that assigns a local",
  L007: "A loop whose bound cannot be checked, or a recursive method",
  L008: "A possibly-empty value used without a check",
  L009: "A dynamic property name",
  L010: "More parameters than the slot passes",
  L011: "A name argument that must be a literal, or that names nothing declared",
  L012: "A subset construct lowering does not handle yet",
  L013: "A store to a read-only place",
  L014: "A signature lowering cannot infer, that call sites disagree on, or whose effects are unknown",
  L015: "The wrong number of arguments",
});

/** @typedef {keyof typeof LOWER_CODES} LowerCode */

/** The owner of a program's top-level helpers in a signature key, as `Mole` is of a method: `$.name`. */
export const HELPER_OWNER = "$";

/**
 * " Did you mean 'x'?" for the closest of `names` to `name`, or "".
 * @param {string} name
 * @param {readonly string[]} names
 */
export function didYouMean(name, names) {
  let best = "", bestD = Infinity;
  for (const n of names) {
    const d = distance(name.toLowerCase(), n.toLowerCase());
    if (d < bestD) { best = n; bestD = d; }
  }
  return best && bestD <= Math.max(1, Math.ceil(name.length / 3)) ? ` Did you mean '${best}'?` : "";
}

/**
 * Levenshtein distance.
 * @param {string} a
 * @param {string} b
 */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
