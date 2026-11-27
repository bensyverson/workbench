// Image sources for drawCanvas: each part's images that name a file (kit/draw's `images`, `file`), their bytes
// from the loaded package (kit/package's `data`), decoded by the host's function (createImageBitmap in a browser),
// keyed by their carried name, `<part>.<image>`. The kit never decodes pixels.

/** @typedef {(bytes: Uint8Array, info: { name: string, path: string, width: number, height: number }) => unknown} Decode */

/**
 * Decodes every image with a file. Resolves to the sources and the W003 problems (a file no loaded package holds,
 * a decoder that threw or rejected); without a decoder there are no sources and no problems: every image draws as its box.
 * @param {Array<{ name: string, dialect: string }>} parts @param {any[]} runtimes @param {any[]} packages @param {Decode | undefined} decode
 * @returns {Promise<{ sources: Record<string, unknown>, problems: Array<{ part: string, message: string }> }>}
 */
export async function decodeSources(parts, runtimes, packages, decode) {
  /** @type {Record<string, unknown>} */
  const sources = {};
  /** @type {Array<{ part: string, message: string }>} */
  const problems = [];
  if (typeof decode !== "function") return { sources, problems };
  const jobs = [];
  for (const p of parts) {
    const rt = runtimes.find((r) => r.dialect?.name === p.dialect);
    const pkg = packages.find((k) => k?.name === p.dialect || k?.dialect === rt?.dialect);
    for (const [image, decl] of Object.entries(/** @type {Record<string, any>} */ (rt?.dialect?.seams?.images ?? {}))) {
      if (typeof decl.file !== "string") continue;
      const name = `${p.name}.${image}`;
      const file = pkg?.data?.[decl.file];
      if (!file?.bytes) { problems.push({ part: p.name, message: `${name}'s file ${decl.file} is not in a loaded package (kit/package's loadPackage reads it), so it draws as its box` }); continue; }
      jobs.push((async () => {
        try { sources[name] = await decode(file.bytes, { name, path: decl.file, width: file.width, height: file.height }); } catch (e) {
          problems.push({ part: p.name, message: `${name} (${decl.file}) did not decode: ${/** @type {Error} */ (e)?.message ?? String(e)}; it draws as its box` });
        }
      })());
    }
  }
  await Promise.all(jobs);
  return { sources, problems };
}
