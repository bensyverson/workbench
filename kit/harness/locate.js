// Where in the source a pixel's color came from: the `return` the interpreter took for it, found again in the
// author's lambda and in each backend's line map. A difference between backends has no intermediate values
// to point at (a shader gives only its output), so the returning statement is the finest place the harness can name.

import { pixelUv } from "./cases.js";

/**
 * @typedef {object} Location
 * @property {string} kernel  The pixel Kernel's name.
 * @property {number} line  The line of the `return`, counted from the first line of the pixel lambda.
 * @property {string} text  That line, trimmed.
 * @property {number} jsLine  The line of the emitted JS function (counted from its first line), or 0 when the map has none.
 * @property {number} glslLine  The line of the shader, or 0.
 */

/**
 * @param {import("./pipeline.js").Pipeline} p
 * @param {[number, number]} pixel  Column, and row from the bottom.
 * @param {number} width
 * @param {number} height
 * @param {Record<string, unknown>} uniforms  As the host takes them (a choice by name).
 * @returns {Location}
 */
export function locate(p, pixel, width, height, uniforms) {
  const kernel = p.kernels.pixel;
  /** @type {[number, number] | null} */
  let span = null;
  p.interp(pixelUv(pixel[0], pixel[1], width, height), uniforms, (e) => {
    if (e.stmt && e.kind === "return" && e.depth === 0) span = e.span;
  });
  if (!span) throw new Error(`${kernel.name} returned without a return statement at ${pixel}`);
  const [from, to] = /** @type {[number, number]} */ (span);
  const line = kernel.src.slice(0, from).split("\n").length;
  const sameSpan = (/** @type {[number, number]} */ s) => s[0] === from && s[1] === to;
  const jsAt = p.jsEmitted.lines.findIndex((/** @type {{ span: [number, number] }} */ l) => sameSpan(l.span));
  const glslAt = p.glsl.lines.findIndex((l) => l.origin === "kernel" && l.kernel === kernel.name && sameSpan(l.span));
  return { kernel: kernel.name, line, text: kernel.src.slice(from, to).split("\n")[0].trim(), jsLine: jsAt + 1, glslLine: glslAt + 1 };
}
