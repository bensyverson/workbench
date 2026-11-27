// Test fixtures: the bytes of a PNG's signature and IHDR chunk, which is all kit/package reads of a picture. The
// CRC is left zero (kit/package does not check it), and no image data follows. They live beside test/, not in it,
// since every file under a test/ folder runs as a test.

/** A PNG of `width` by `height`, as far as its header goes. @param {number} width @param {number} height */
export function pngHeader(width, height) {
  const b = new Uint8Array(8 + 25);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  v.setUint32(16, width);
  v.setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24); // 8 bits, RGBA, deflate, no filter, no interlace
  return b;
}
