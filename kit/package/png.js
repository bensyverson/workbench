// A PNG's width and height, read from its header: the 8-byte signature, then the IHDR chunk, which the PNG spec
// puts first, holding the width and height as big-endian 32-bit numbers. No decoder: the pixels are the host's.

import { isBytes } from "./content.js";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

/**
 * A PNG's size in pixels, or null when the bytes do not start with a PNG signature and an IHDR chunk.
 * @param {Uint8Array} bytes @returns {{ width: number, height: number } | null}
 */
export function readPngSize(bytes) {
  if (!isBytes(bytes) || bytes.length < 24) return null;
  if (SIGNATURE.some((b, i) => bytes[i] !== b) || IHDR.some((b, i) => bytes[12 + i] !== b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getUint32(16), height = v.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}
