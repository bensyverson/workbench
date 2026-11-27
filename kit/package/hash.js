import { MANIFEST_PATH } from "./manifest.js";
import { bytesOf } from "./content.js";

// Content hashes in the Subresource Integrity spelling, over globalThis.crypto.subtle (Node and the page).

/**
 * The hash of a file's bytes (text as its UTF-8 bytes, so a file hashes the same as text or as bytes): `sha256-<base64>`.
 * @param {import("./content.js").FileContent} content @returns {Promise<string>}
 */
export async function hashText(content) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", /** @type {Uint8Array<ArrayBuffer>} */ (bytesOf(content))));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return `sha256-${btoa(bin)}`;
}

/**
 * The package's content key: the hash over its files' `path\0hash\n` lines in path order, then one more line for
 * the manifest, `wb-package.json\0<the hash of the manifest's text>\n`, so a changed manifest (a different
 * entry, say) is a different key. The hashes catch accidental change; they do not make a package trusted.
 * @param {Record<string, string>} filesHashes  the manifest's `files`
 * @param {string} manifestText  the manifest as written, byte for byte
 * @returns {Promise<string>}
 */
export async function contentKey(filesHashes, manifestText) {
  const lines = Object.keys(filesHashes).sort().map((p) => `${p}\0${filesHashes[p]}\n`).join("");
  return hashText(`${lines}${MANIFEST_PATH}\0${await hashText(manifestText)}\n`);
}
