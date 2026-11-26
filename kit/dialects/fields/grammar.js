// The fields Grammar, through the Definition API: one construct, a field, with `param` declarations, helpers
// and constants, and a `pixel` Runtime Lambda. The builder is the one defineGrammar generates:
// `field("swirl").param("angle", { value: 2.4 }).pixel((uv, u) => …).build()` returns a FieldProgram, a lambda
// being its source text whether it was passed as a function or a string. An unknown method throws at once;
// every other refusal is collected with its call site and thrown by `.build()` (`.check()` lists them).

import { defineGrammar, name, data, lambda, oneOf } from "../../define/index.js";
import { fields } from "./dialect.js";
import { library } from "./library.js";

/** A param, in the one declaration form every Program uses: a number, a choice, a toggle or an image (decls.d.ts, ParamDecl). */
const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number" },
  { value: "string", options: "string[]" },
  { value: "boolean" },
  { image: "boolean" },
);

export const field = defineGrammar(fields, {
  root: "field",
  params: { slot: "param" },
  constructs: {
    field: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", args: [name("uniform"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            const decl = /** @type {{ value: unknown, min?: number, max?: number, image?: boolean }} */ (p);
            if (n === "t" || n === "aspect") ctx.error("F002", `param '${n}' clashes with the built-in uniform u.${n}`, { arg: 0, tip: "rename the param" });
            if (decl.image === false) ctx.error("F004", `param '${n}': an image param is { image: true }, so { image: false } declares nothing`, { arg: 1, tip: "write { image: true }, or declare a number, a choice or a toggle" });
            if (typeof decl.value === "number" && (decl.value < (decl.min ?? -Infinity) || decl.value > (decl.max ?? Infinity))) {
              ctx.error("F001", `param '${n}': its value ${decl.value} lies outside its range ${decl.min ?? "-∞"}..${decl.max ?? "∞"}`, { arg: 1, tip: "move the value inside min..max" });
            }
          },
        },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        pixel: { kind: "decl", args: [lambda("pixel")], once: true, required: true },
      },
      // Params, helpers and the Library share one namespace: a param may not share a name with a helper or a
      // Library entry. (A helper named like a Library entry is the builder's own B002.)
      check(record, ctx) {
        const units = /** @type {Array<{ name: string }>} */ (record.units).map((u) => u.name);
        for (const n of Object.keys(/** @type {object} */ (record.params))) {
          if (units.includes(n) || Object.hasOwn(library, n)) ctx.error("F003", `field '${record.name}' cannot declare param '${n}': ${Object.hasOwn(library, n) ? "the Library" : "a helper or constant"} already has that name`, { tip: "rename the param" });
        }
      },
    },
  },
});
