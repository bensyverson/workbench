// Running a pixel function over a grid.

import { pixelUv } from "./cases.js";

/**
 * Calls `pixel` at the center of each pixel, row 0 at the bottom, and collects the rgb as f32s.
 * @param {(uv: number[], u: Record<string, unknown>) => number[]} pixel
 * @param {number} width
 * @param {number} height
 * @param {Record<string, unknown>} uniforms
 * @returns {Float32Array}  Three floats per pixel, `(j * width + i) * 3`.
 */
export function evaluateGrid(pixel, width, height, uniforms) {
  const out = new Float32Array(width * height * 3);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const c = pixel(pixelUv(i, j, width, height), uniforms);
      if (c.length !== 3) throw new Error(`the pixel function returned ${c.length} components at (${i}, ${j})`);
      out.set(c, (j * width + i) * 3);
    }
  }
  return out;
}
