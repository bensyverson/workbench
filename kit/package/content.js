// A package file's content, as the host holds it: text (a string) or bytes (a Uint8Array). Text is UTF-8 when it
// becomes bytes, and bytes are text only when they are valid UTF-8. Base64 is the bundle's spelling of bytes. No
// Node built-ins: TextEncoder, TextDecoder, atob and btoa are in the page and in Node alike.

/** @typedef {string | Uint8Array} FileContent */

/** A file's bytes: text as UTF-8. @param {FileContent} c @returns {Uint8Array} */
export const bytesOf = (c) => (typeof c === "string" ? new TextEncoder().encode(c) : c);

/** A file's text, or null when its bytes are not valid UTF-8. @param {FileContent} c @returns {string | null} */
export function textOf(c) {
  if (typeof c === "string") return c;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(c); } catch { return null; }
}

/** Bytes as base64. @param {Uint8Array} b */
export function toBase64(b) {
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Base64 as bytes, or null when it is not base64. @param {string} s @returns {Uint8Array | null} */
export function fromBase64(s) {
  let bin;
  try { bin = atob(s); } catch { return null; }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
