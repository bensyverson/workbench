// Vector arithmetic as calls: `vadd(a, b)` is what `a + b` means on two vectors of one type. These
// are the "call style" of H3's comparison (project/2026-11-23-h3-styles-comparison.md): the same
// operations as the typed operators, spelled as intrinsic calls, so a Program can be written with no
// operator on a vector at all. Each is componentwise over an f32 or any vector `T` (so `vadd` also
// adds two f32s), spelled as the operator it names on both targets, and rounded to f32 as the operator is,
// so the two styles agree bit for bit.

/** @import { IntrinsicDef } from "../../define/define.js" */

/**
 * A componentwise intrinsic over `T`, whose last argument is an f32 when `scaled`.
 * @param {number} lead  How many arguments are `T`.
 * @param {number} rest  How many trailing f32 arguments.
 * @param {IntrinsicDef["ref"]} ref
 * @param {string} template  Both targets' spelling; it is the operator, so it is the same text.
 * @returns {IntrinsicDef}
 */
const op = (lead, rest, ref, template) => ({
  params: [...Array(lead).fill("T"), ...Array(rest).fill("f32")], returns: "T", numeric: "number", componentwise: true,
  ref, spell: { js: template, glsl: template },
});

/** The vector-call intrinsics, by the name a lambda calls. */
export const calls = /** @type {Record<string, IntrinsicDef>} */ ({
  vadd: op(2, 0, (a, b) => a + b, "($0 + $1)"),
  vsub: op(2, 0, (a, b) => a - b, "($0 - $1)"),
  vmul: op(2, 0, (a, b) => a * b, "($0 * $1)"),
  vdiv: op(2, 0, (a, b) => a / b, "($0 / $1)"),
  vscale: op(1, 1, (a, s) => a * s, "($0 * $1)"),
  vneg: op(1, 0, (a) => -a, "(-$0)"),
});
