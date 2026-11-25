// The Definition API: `defineDialect` says what a Domain Language means, `defineGrammar` how a Program
// is written; the kit generates the builder, its diagnostics and the lowering of every Runtime Lambda.
// The spec is scripts/define-trial/docs/api-draft.md; README.md says what is built.

export { defineDialect, DefinitionError } from "./dialect.js";
export { defineGrammar, BuildError } from "./grammar.js";
export { defineUI, isUI } from "./ui.js";
export { DEFINE_CODES, BUILD_CODES, UI_CODES, didYouMean } from "./codes.js";
export { vector, scalar, exact, tolerance, list, opt, struct, union, enumOf, object, name, ref, data, lambda, rest, oneOf, recordOf, listOf } from "./tags.js";
export { run, needsRebuild, bindingText } from "./params.js";
