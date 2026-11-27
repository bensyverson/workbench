// A Grammar with a slot whose second argument is optional, so a Program text can write a trailing `undefined`
// (the builder drops it; write-back must still find the call). Beside test/, since every file under a test/ folder runs as a test.

import { data, opt } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

/** One declaring slot, `.mark(<{ size }>, <optional number>)`. */
export const optional = tiny("optional", { state: { n: "f64" }, inputs: false, ports: { out: {} }, slots: { mark: { kind: "decl", args: [data({ size: data("number", { min: 1, max: 40 }) }), opt(data("number"))] } } }, { clock: () => ({ tick: 1 / 60 }), init: () => ({ n: 0 }), step: (/** @type {any} */ s) => s });

/** The Grammar. */
export const g = optional.grammar;

/** This module's URL, for a Program text's first line. */
export const HERE = import.meta.url;
