// The fields Dialect's text view: a rendered frame as characters, for a model to read. A frame is what a
// fields host shows, the pixel Kernel's colors over a grid (kit/harness's convention: row 0 is the bottom).

/**
 * A rendered frame: `pixels[j * width + i]` is the rgb color of column `i`, row `j` from the bottom, each
 * channel nominally in 0..1 (values outside are clamped for the view).
 * @typedef {{ width: number, height: number, pixels: ArrayLike<ArrayLike<number>> }} Frame
 */

/** Dark to light. */
const RAMP = " .:-=+*#%@";
/** The most characters across and down: enough to see a pattern, small enough for a model's context. */
export const TEXT_COLUMNS = 64;
export const TEXT_ROWS = 32;

/** Relative luminance (Rec. 709), clamped to 0..1. @param {ArrayLike<number>} c */
const luma = (c) => Math.min(1, Math.max(0, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]));

/**
 * The frame drawn in characters, top row first, one character per pixel or, for a frame larger than
 * TEXT_COLUMNS by TEXT_ROWS, the mean brightness of the block of pixels it covers; a first line says the sizes.
 * @param {Frame} frame
 * @returns {string}
 */
export function frameText(frame) {
  const { width, height, pixels } = frame;
  const cols = Math.min(width, TEXT_COLUMNS), rows = Math.min(height, TEXT_ROWS);
  const head = `fields frame: ${width} × ${height}${cols < width || rows < height ? `, drawn as ${cols} × ${rows} (each character the mean brightness of its pixels)` : ""}`;
  const lines = [head];
  for (let r = rows - 1; r >= 0; r--) {
    let line = "";
    const j0 = Math.floor((r * height) / rows), j1 = Math.max(j0 + 1, Math.floor(((r + 1) * height) / rows));
    for (let c = 0; c < cols; c++) {
      const i0 = Math.floor((c * width) / cols), i1 = Math.max(i0 + 1, Math.floor(((c + 1) * width) / cols));
      let sum = 0;
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) sum += luma(pixels[j * width + i]);
      line += RAMP[Math.round((sum / ((j1 - j0) * (i1 - i0))) * (RAMP.length - 1))];
    }
    lines.push(line);
  }
  return lines.join("\n");
}
