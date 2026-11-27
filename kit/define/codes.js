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
  D007: "A name declared twice across intrinsics, globals, library, objects and vectors (or a member, global or state field that environment(program) adds twice), a type named like a built-in or a type variable, or a convention named for a kit-made one",
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
  D019: "A lambda() or a rest() in a construct's opens, which is not built yet (a rest tail there would keep only its first value)",
  D020: "A Dialect without text(state), its text view (its screen and state as characters, sized for a model)",
  D021: "A malformed effect declaration: an unknown verb, object or member in may; a write, destroy or bump with no object; a non-read in a pure space's slot or in helpers; a bump outside an instance space or of a member that is not a total; a write of a member that is not writable; one slot that may both read and bump a total; write and bump on one member, or on a member that is not a value; bump on a non-f64; effects on an intrinsic",
  D022: "An instance a lambda could reach other than as its instance space's slot parameter (a member, method result, global, list item, struct field, intrinsic or call result of its type; a slot outside the space that takes one; a slot in it that takes none or two), or a write or destroy of an object in a slot whose space's instance is not that object",
  D023: "A malformed state (the run's state a Dialect declares): not an object, no members, a member that is not a type or is a nested plain object (write struct({ … })), an object() or a declared object as a member, void or null as a type, a list whose max is not a positive whole number (a state list may leave the max out: list(type)), more than one struct marked { extensible: true } or one inside a union; or state fields from environment(program) that are malformed or have no extensible struct to go in",
  D024: "A malformed ports declaration: a key a port does not take (with a did-you-mean), a missing seam or value output's from, no note on a tagged or Event port, a port name that is not an identifier or is `then` or `__proto__`, a value of the wrong form; a type on an Event input whose record no lambda reads",
  D025: "A seam type that does not parse (a rate over anything but s included), names a frame the Dialect does not declare, or tags a point or vector with a frame of other dims",
  D026: "An output's from that is neither a path nor a lambda, a path that names nothing in the run's state, a lambda that breaks the UI value lambda rules, or a from on an Event output (a runtime pushes its records)",
  D027: "A local type that does not pair with its port's seam type: the state at an output's from, what an output's lambda gives (found when a Program lowers), or the type an input or an Event record's field reads as (no vector type of a point's or vector's dims, or several and no type)",
  D028: "A value input with neither default nor required: true, or both, or a default that does not fit its seam type, or a delivery; an Event input with a default or required, or a delivery other than \"reliable\" or { keepLast: n } (n a positive whole number); a record field default (= value) that does not fit its field, or sits anywhere but a top-level field of an Event input's record",
  D029: "Value inputs without inputs: { object, name }; an inputs object that is not a declared object or already has members; no global of inputs.name naming that object",
  D030: "A malformed frames or edges declaration: a key a frame does not take, dims other than 1, 2 or 3, a missing note, an extent or edges that is not a function, a frame named like the kit's s, `then` or `__proto__`; or (when a Program lowers) an extent(record) or edges(record) that throws or returns the wrong shape",
  D031: "A Grammar whose ref(\"in\") has no ports.in to name, that declares name(\"in\") itself, with a slot or child construct named out, in or frame (the handles every builder has), or a ref kind other than \"event\" or \"value\" on ref(\"in\")",
  D032: "An Event input's record that is not { name, slots }: a name that is not an identifier or is already a global, object, intrinsic, type, the inputs' or params' name or another input's record; slots that are empty or name no slot convention; a record on a value input",
  D033: "A runtime declaration defineRuntime refuses: not on a Grammar builder, a clock, init or step that is not a function, an unknown key, or an Event port without a whole positive max per step (or a max on a value port, on a port the Dialect lacks, or below an input's keepLast n)",
  D034: "A malformed files declaration (a Dialect's data files): not { <name>: { kind, path, note } }, a kind other than text, json or csv (an image is declared in images, with its file), a path that is missing or a .js module, no note, or a path two declarations name",
});

/** defineUI's codes: U… is a UI declaration refused when defineUI is called. U006 is retired (its job, a bad state, is D023's); its number is not reused. */
export const UI_CODES = Object.freeze({
  U001: "An unknown key (with a did-you-mean), or a required key missing; a `state` key, which belongs to defineDialect",
  U002: "A component kind that does not exist",
  U003: "A place or annotate that names no view or tile, or tiles placed in a cycle",
  U004: "A place without exactly one direction, or a bad size",
  U005: "A path that names nothing in the Dialect's state, or names the wrong type for its key",
  U007: "A lambda that does not parse, leaves the subset, takes too many parameters or a destructuring pattern as one, assigns anything but its own let locals, reads an undeclared state member or a free name the Dialect does not give, starts a member chain anywhere but at a parameter or a Dialect global (a local that is not a const set to exactly a parameter chain, a conditional, a call, an array), holds state in a local other than that const (a let or const set from a struct, list or optional that is not exactly a parameter chain, a destructuring, a for…of binding), or uses a list with no declared max other than by its length and an index",
  U008: "A custom element without the package prefix or a valid tag, without a module, with a module that is not a package file or does not define the tag, or a tag used twice",
  U009: "An emits event that is not pick, select or param, or emits without an element",
  U010: "Inputs whose object is not a Dialect object, whose buttons are not exactly its bool members, or with an unknown or repeated role",
  U011: "A tile id that is not an identifier or is a generated view's id",
  U012: "A value of the wrong form: a non-string label, title or note, a number out of range or not whole, a bad columns entry, an empty body or items",
  U013: "defineUI given something other than the package's Grammar builder, or a Dialect that declares no state",
  U014: "A Draw stage (`stage: { draw }`) naming an output the Dialect lacks (with a did-you-mean) or one that is not a Draw seam, or a stage that is both a Draw output and a custom element",
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
export const RESERVED_LETTERS = Object.freeze(["B", "C", "D", "J", "L", "N", "P", "S", "U", "V", "W"]);

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
