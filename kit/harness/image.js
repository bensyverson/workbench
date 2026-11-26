// Where a SamplerImage enters the harness: `checkImage` refuses a malformed one by name, so the interpreter, the JS
// function and the GPU never read different things from it (the upload wraps bytes, the reference reads them raw).

/** @import { SamplerImage } from "../interp/interp.js" */

/** A SamplerImage that is not whole: the message says which part. */
export class ImageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ImageError";
  }
}

/**
 * Checks a SamplerImage: a positive whole `width` and `height`, `data` of `width * height * 4` entries, each a whole
 * byte 0..255.
 * @param {unknown} img
 * @param {string} [what]  How the message names the image.
 * @returns {SamplerImage}
 */
export function checkImage(img, what = "image") {
  if (img === null || typeof img !== "object") throw new ImageError(`${what}: not an image (${img === null ? "null" : typeof img}), expected { width, height, data }`);
  const { width, height, data } = /** @type {Partial<SamplerImage>} */ (img);
  for (const [name, v] of /** @type {const} */ ([["width", width], ["height", height]])) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new ImageError(`${what}: ${name} must be a positive whole number, not ${String(v)}`);
  }
  if (data === null || typeof data !== "object" || typeof data.length !== "number") throw new ImageError(`${what}: data must be an array or typed array of bytes`);
  const want = /** @type {number} */ (width) * /** @type {number} */ (height) * 4;
  if (data.length !== want) throw new ImageError(`${what}: ${width} by ${height} texels need ${want} bytes of data (RGBA), not ${data.length}`);
  for (let i = 0; i < want; i++) {
    const b = data[i];
    if (!Number.isInteger(b) || b < 0 || b > 255) throw new ImageError(`${what}: data[${i}] is ${String(b)}, not a whole byte 0..255`);
  }
  return /** @type {SamplerImage} */ (img);
}
