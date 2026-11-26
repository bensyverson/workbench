// The op table as core IR types, for lowering a Draw builder through kit/lower: each op a struct tagged by its
// `op`, the ops a union of them, a draw list a list of that union, and the pen a handle whose six methods each add
// one op. Colors and images are strings here (a name is the Dialect's, checked when the list is built), and so
// is a tiles `key`'s value type: the IR has no map type, so the key is the one field lowering leaves to the
// build-time check (kit/draw's typeOp, J020). No Node built-ins.

import { OPS, OP_KINDS, FONTS } from "./ops.js";

/** @import { Type } from "../ir/ir.js" */
/** @import { ObjectDecl } from "../lower/environment.js" */

/** A list with no max the IR can name (a line's points, a tiles grid's rows): only a bound for assignability. */
export const OPEN = Number.MAX_SAFE_INTEGER;
/** The object name a pen builder's second parameter has. */
export const PEN_OBJECT = "DrawPen";
/** The effect a pen's method records: a pen builder's slot may it, and no other builder may. */
export const PEN_EFFECT = `emit ${PEN_OBJECT}`;

/**
 * Each op field type of the table as a core Type, over the Dialect's number type. A point is written `[x, y]`:
 * a Dialect's vector type is not one (a core union never mixes a vector with a list of numbers).
 * @param {"f64" | "f32"} num
 * @returns {Record<string, Type>}
 */
function fieldTypes(num) {
  /** @type {Type} */
  const pair = { list: num, max: 2 };
  return {
    point2: pair, vec2: pair, f64: num, bool: "bool", str: "str", color: "str", image: "str", cell: num,
    font: { enum: [...FONTS] }, flip: { enum: ["x", "xy", "y"] },
    points: { list: pair, max: OPEN },
    grid: { union: [{ list: { list: num, max: OPEN }, max: OPEN }, { list: "str", max: OPEN }] },
    key: "unknown",
  };
}

/**
 * One op kind's struct: its tag and its fields, the optional ones named so.
 * @param {string} kind @param {Record<string, Type>} types @param {boolean} tagged
 * @returns {Type}
 */
function opStruct(kind, types, tagged) {
  const fields = /** @type {Record<string, [string, boolean]>} */ (/** @type {any} */ (OPS)[kind]);
  /** @type {Record<string, Type>} */
  const struct = tagged ? { op: { enum: [kind] } } : {};
  const optional = [];
  for (const [k, [t, required]] of Object.entries(fields)) { struct[k] = types[t]; if (!required) optional.push(k); }
  return optional.length ? { struct, optional } : { struct };
}

/**
 * The op table as lowering reads it: `op` the union of every op's struct, `list(max)` a draw list of at most
 * `max` ops, and `pen` the pen's object.
 * @param {"f64" | "f32"} [num]
 * @returns {{ op: Type, list: (max: number) => Type, pen: ObjectDecl }}
 */
export function drawTypes(num = "f64") {
  const types = fieldTypes(num);
  /** @type {Type} */
  const op = { union: OP_KINDS.map((k) => opStruct(k, types, true)) };
  /** @type {ObjectDecl} */
  const pen = {
    label: "the pen",
    members: Object.fromEntries(OP_KINDS.map((k) => [k, { kind: /** @type {const} */ ("fn"), params: [opStruct(k, types, false)], returns: /** @type {Type} */ ("void"), effects: [/** @type {any} */ (PEN_EFFECT)] }])),
  };
  return { op, list: (max) => ({ list: op, max }), pen };
}
