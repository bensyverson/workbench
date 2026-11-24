// The data Dialect: tables of typed columns, cleaned, derived, filtered, grouped and joined, with pure
// runtime lambdas over a row or a group. What it means is declared through the Definition API in dialect.js;
// how a Program is written (`program`) is the builder defineGrammar generates from grammar.js.

export { data, INTRINSICS, COLUMN_TYPES } from "./dialect.js";
export { program } from "./grammar.js";
