// Content hashes in the Subresource Integrity spelling, over globalThis.crypto.subtle (Node and the page).

/** The hash of `text`'s UTF-8 bytes: `sha256-<base64>`. @param {string} text @returns {Promise<string>} */
export async function hashText(text) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return `sha256-${btoa(bin)}`;
}

/** The package's content key: the hash over its files' `path\0hash\n` lines in path order. @param {Record<string, string>} filesHashes @returns {Promise<string>} */
export function contentKey(filesHashes) {
  return hashText(Object.keys(filesHashes).sort().map((p) => `${p}\0${filesHashes[p]}\n`).join(""));
}
