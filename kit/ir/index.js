// The kit's core IR: types, a text listing, and the type operations lowering and
// emitters share. The node shapes are in ir.d.ts.

export { printKernel } from "./print.js";
export { formatJSON } from "./json.js";
export { showType, sameType, assignable, join, optional, unify, substitute } from "./types.js";
