// What the page needs to hand a shader and to read back from it, as data: the uniforms to upload and
// how far the interpreter's color is from the GPU's. No GL calls: the page makes them.

/**
 * The interpreter's color against the bytes a framebuffer holds: what the GPU would store for the
 * interpreter's value (clamped to [0, 1], times 255, rounded) and the difference, in 8-bit steps.
 * @param {number[]} color  The Kernel's result, three or four components.
 * @param {ArrayLike<number>} rgba  The bytes `readPixels` gave.
 * @returns {{ expected: number[], gpu: number[], delta: number[], maxDelta: number }}
 */
export function compareColor(color, rgba) {
  const expected = color.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  const gpu = expected.map((_, i) => rgba[i]);
  const delta = gpu.map((g, i) => g - expected[i]);
  return { expected, gpu, delta, maxDelta: Math.max(...delta.map(Math.abs)) };
}

/**
 * @typedef {object} GlslUniform
 * @property {string} glsl  The shader's name for it, `u_<param>`.
 * @property {string} param
 * @property {string} kind  `float`, `int` or `bool`.
 * @property {string[]} [options]  A choice's values, in the order the shader's index counts.
 */

/**
 * What to upload for each uniform the emitted shader declares: a choice as the index of its option,
 * a toggle as 0 or 1, a number as is.
 * @param {GlslUniform[]} uniforms  `emitGlsl`'s `uniforms`.
 * @param {Record<string, unknown>} values  The `u` object the interpreter takes.
 * @returns {Array<{ name: string, kind: string, value: number }>}
 */
export function glslUniformValues(uniforms, values) {
  return uniforms.map((u) => {
    const v = values[u.param];
    if (v === undefined) throw new Error(`no value for uniform '${u.param}'`);
    if (u.options) {
      const index = u.options.indexOf(/** @type {string} */ (v));
      if (index < 0) throw new Error(`'${String(v)}' is not an option of '${u.param}' (${u.options.join(", ")})`);
      return { name: u.glsl, kind: u.kind, value: index };
    }
    if (u.kind === "bool") return { name: u.glsl, kind: u.kind, value: v ? 1 : 0 };
    return { name: u.glsl, kind: u.kind, value: Number(v) };
  });
}
