// The fields Grammar: one construct, a field, with `param` declarations, helpers and a `pixel`
// Runtime Lambda (the proposal's §8.2, written by hand: the generic `.construct()` machinery
// is M3's). `field("swirl").param("angle", { value: 2.4 }).pixel("(uv, u) => …").build()`.

import { LIBRARY } from "./library.js";

/** @import { FieldProgram, ParamDecl, UnitDecl } from "./decls.js" */

/** @param {unknown} v @param {string} what */
function source(v, what) {
  if (typeof v === "string" && v.trim() !== "") return v;
  throw new Error(`${what} takes its source as a string: "(uv, u) => …"; it is lowered, not run, so a function value would only be its text`);
}

/**
 * Starts a field Program.
 * @param {string} name
 */
export function field(name) {
  /** @type {Record<string, ParamDecl>} */
  const params = {};
  /** @type {UnitDecl[]} */
  const units = [];
  /** @type {string | null} */
  let pixel = null;
  const taken = (/** @type {string} */ n) => {
    if (LIBRARY.some((u) => u.name === n)) throw new Error(`field '${name}' cannot declare '${n}': the Library already defines a ${LIBRARY.find((u) => u.name === n)?.kind === "const" ? "constant" : "function"} of that name, and a second one would replace it inside the Library too`);
    return n in params || units.some((u) => u.name === n);
  };
  const builder = {
    /**
     * Declares a param: a uniform, read in the pixel lambda as `u.name`.
     * @param {string} n
     * @param {ParamDecl} decl
     */
    param(n, decl) {
      if (taken(n)) throw new Error(`field '${name}' already declares '${n}'`);
      params[n] = decl;
      return builder;
    },
    /**
     * A helper function of this field, called by name from the pixel lambda or another helper.
     * @param {string} n
     * @param {string} src
     */
    fn(n, src) {
      if (taken(n)) throw new Error(`field '${name}' already declares '${n}'`);
      units.push({ name: n, kind: "fn", src: source(src, `fn('${n}')`) });
      return builder;
    },
    /**
     * A constant of this field, baked in at each use.
     * @param {string} n
     * @param {string} src  The initializer, as an expression.
     */
    const(n, src) {
      if (taken(n)) throw new Error(`field '${name}' already declares '${n}'`);
      units.push({ name: n, kind: "const", src: source(src, `const('${n}')`) });
      return builder;
    },
    /**
     * The pixel lambda: `(uv, u) => color`, over each pixel's position `uv`.
     * @param {string} src
     */
    pixel(src) {
      if (pixel !== null) throw new Error(`field '${name}' already has a pixel lambda`);
      pixel = source(src, "pixel");
      return builder;
    },
    /** @returns {FieldProgram} */
    build() {
      if (pixel === null) throw new Error(`field '${name}' has no pixel lambda: add .pixel("(uv, u) => …")`);
      return { name, params: { ...params }, pixel, units: [...units] };
    },
  };
  return builder;
}
