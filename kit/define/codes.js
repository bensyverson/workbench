// The Definition API's codes: D… for a definition (refused when defineDialect or defineGrammar is
// called), B… for a Program the generated builder refuses. Lowering keeps its own L… codes.

import { didYouMean } from "../lower/codes.js";

export { didYouMean };

/** Each code and what it means; the tests check that every one is exercised. */
export const DEFINE_CODES = Object.freeze({
  D001: "A key that defineDialect or defineGrammar does not take, or a required key missing",
  D002: "A type name that resolves to nothing",
  D003: "An intrinsic without a spelling for a target that accepts a space",
  D004: "An intrinsic without ref, params or returns",
  D005: "A slot convention whose space is not declared",
  D006: "A target whose accepts names an undeclared space",
  D007: "A name declared twice across intrinsics, globals, library, objects and vectors (or a member or global that environment(program) adds twice), a type named like a built-in or a type variable, or a convention named for a kit-made one",
  D008: "A compare mode other than exact() or tolerance(figure) with a positive figure",
  D009: "A lambda(convention) that names no slot convention",
  D010: "A child construct with a method of its parent's name, a parent or root that is not a construct, or a method the kit makes",
  D011: "A malformed declaration, argument spec or shape",
  D012: "A space with neither pure: true nor instance, or with both, or whose instance names no object",
  D013: "A library entry that is not { fn: src } or { const: src }, or whose source does not parse",
  D014: "A slot without a kind, or with a kind other than decl or unit",
  D015: "A construct state without record: \"calls\", init or step, or whose names clash with a Program namespace; an opt or rest argument that is not last",
  D017: "Two things in a construct that the record would put under one key: an opening argument, a child construct, a slot's as, units",
  D018: "A slot or construct named like a property runtimes probe on every object (then, toJSON, inspect, …)",
  D019: "A lambda() in a construct's opens, which is not built yet",
  D020: "A Dialect without text(state), its text view (its screen and state as characters, sized for a model)",
  D021: "A malformed effect declaration: an unknown verb, object or member in may; a write, destroy or bump with no object; a non-read in a pure space's slot or in helpers; a bump outside an instance space or of a member that is not a total; a write of a member that is not writable; one slot that may both read and bump a total; write and bump on one member, or on a member that is not a value; bump on a non-f64; effects on an intrinsic",
  D022: "An instance a lambda could reach other than as its instance space's slot parameter (a member, method result, global, list item, struct field, intrinsic or call result of its type; a slot outside the space that takes one; a slot in it that takes none or two), or a write or destroy of an object in a slot whose space's instance is not that object",
});

/** The generated builder's codes. */
export const BUILD_CODES = Object.freeze({
  B001: "A method the construct does not have",
  B002: "A name already declared in its namespace",
  B003: "A ref that names nothing",
  B004: "A value that does not fit its shape or a number shape's min, max or whole, or a param whose declared value does not fit its own declaration",
  B005: ".build() on a construct missing a required slot or a required child construct",
  B006: "A second call to a once slot",
  B007: "A lambda that is not an arrow function or its source text, or does not parse",
  B008: "A free name the free-name rule does not allow",
  B009: "A call to a rejected name",
  B010: "A construct state that depends on itself through stateOf",
  B011: "A slot convention that refused the lambda (it returned a reason)",
  B012: "A top-level binding a lambda reads that is neither the arrow function its declaration writes nor plain data",
  B013: "A free name the file declares only inside build-time code, not at its top level",
  B014: "A member of the params known only at run time (fields' u.t), read by build-time code",
  B015: "The params read by build-time code other than by name ($.name): with in, a spread, Object.keys, JSON.stringify or a rest pattern",
  B016: "A Program's code that opens its root more than once in one run (a Program file builds one Program)",
  B017: "A Program's code that opens its root but returns something other than that builder chain ({ program: chain }, what .build() returns, nothing)",
});

/** A word with its indefinite article, for a message: `an account`, `a flow`. @param {string} w */
export const an = (w) => `${(/^[aeiou]/i.test(w) && !/^(uni(?![nm])|us[aeu]|uti|eu|one|once|ubiq)/i.test(w)) || /^(hour|honest|honor|heir)/i.test(w) ? "an" : "a"} ${w}`;

/** Letters a Dialect's own check codes may not start with. */
export const RESERVED_LETTERS = Object.freeze(["B", "C", "D", "L", "P", "S", "V"]);

/**
 * The fields of a Dialect's own refusal, as a check's or a step's `ctx.error` makes it: the message with a
 * did-you-mean from `suggest` against the argument at `arg`, the tip (else `write <fix>`), `arg` and `fix`.
 * A code that is not one letter and three digits, or starts with a reserved letter, throws.
 * @param {string} who  "check" or "step", for the throw
 * @param {string} code @param {string} message @param {import("./define.js").ErrorOptions} o @param {unknown[]} args
 */
export function dialectError(who, code, message, o, args) {
  if (!/^[A-Z]\d{3}$/.test(code) || RESERVED_LETTERS.includes(code[0])) throw new Error(`a ${who}'s code '${code}' must be the Dialect's own letter and three digits, not one of ${RESERVED_LETTERS.join(", ")}`);
  const path = o.arg === undefined ? [] : Array.isArray(o.arg) ? o.arg : [o.arg];
  /** @type {any} */
  let v = args;
  for (const p of path) v = v?.[p];
  const mean = o.suggest && typeof v === "string" ? didYouMean(v, o.suggest) : "";
  return { code, severity: /** @type {const} */ ("error"), message: `${message}${mean}`, tip: o.tip ?? (o.fix ? `write ${o.fix}` : ""), ...(o.arg !== undefined ? { arg: o.arg } : {}), ...(o.fix ? { fix: o.fix } : {}) };
}
