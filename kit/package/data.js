// A package's data files (the package format draft's ruling of 2026-11-26, leaf hca0YM): each file the Dialect
// names (kit/define's dataFiles), checked once the Dialect is imported. It must be a package path the manifest's
// `files` lists (K017; its hash is checkPackage's K006, as for every listed file), it must decode as its kind (K018),
// and a PNG must be its image's declared size (K019). Decoding pixels is the host's.

import { dataFiles } from "../define/data-files.js";
import { diag } from "./codes.js";
import { textOf } from "./content.js";
import { readPngSize } from "./png.js";
import { isDotPath, isModulePath, isPackagePath } from "./paths.js";

/** @typedef {import("./package.js").DataFile} DataFile */

/**
 * The Dialect's data files, read and checked: by path when every one is sound.
 * @param {any} dialect @param {import("./package.js").Manifest} manifest @param {import("./package.js").PackageFiles} files
 * @returns {{ data: Record<string, DataFile>, diagnostics: import("./package.js").PackageDiagnostic[] }}
 */
export function checkData(dialect, manifest, files) {
  /** @type {Record<string, DataFile>} */
  const data = {};
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const ds = [];
  const where = manifest.entry.dialect;
  const images = /** @type {Record<string, { size: number[], cell?: number[] }>} */ (dialect.def?.images ?? {});
  for (const f of dataFiles(dialect)) {
    const named = `${f.from} names ${f.path}`;
    if (!isPackagePath(f.path) || isDotPath(f.path) || isModulePath(f.path)) {
      ds.push(diag("K017", `${named}, which is not a normalized relative path to a data file (no leading "/", ".", "..", dotfile or .js module)`, `write the path relative to the package folder, such as "data/<file>"`, where));
      continue;
    }
    if (!Object.hasOwn(manifest.files, f.path) || !Object.hasOwn(files, f.path)) {
      ds.push(diag("K017", `${named}, which the package does not hold and its manifest's files does not list`, `add ${f.path} to the package and run node scripts/pkg/hash.js <dir>, or fix the path in ${f.from}`, where));
      continue;
    }
    const content = files[f.path];
    const kind = /** @type {DataFile["kind"]} */ (f.kind);
    if (kind === "image") {
      const size = content instanceof Uint8Array ? readPngSize(content) : null;
      const name = f.from.slice("images.".length);
      if (!size || !(content instanceof Uint8Array)) { ds.push(diag("K018", `${f.from}'s file ${f.path} is not a PNG${typeof content === "string" ? " (it is held as text; a picture travels as bytes)" : " (no PNG signature and IHDR chunk)"}`, `save the picture as a PNG, and pass it as bytes (a Uint8Array) in the file map or as { "base64": … } in a bundle`, f.path)); continue; }
      const img = images[name];
      if (size.width !== img.size[0] || size.height !== img.size[1]) {
        ds.push(diag("K019", `${f.path} is ${size.width} by ${size.height} pixels; ${f.from} declares size [${img.size.join(", ")}]${img.cell ? ` (cells of ${img.cell[0]} by ${img.cell[1]})` : ""}`, `make the picture ${img.size[0]} by ${img.size[1]} pixels, or declare ${f.from}.size: [${size.width}, ${size.height}]${img.cell ? " with a cell that divides it" : ""}`, f.path));
        continue;
      }
      data[f.path] = { path: f.path, kind, from: f.from, bytes: content, width: size.width, height: size.height };
      continue;
    }
    const text = textOf(content);
    if (text === null) { ds.push(diag("K018", `${f.from}'s file ${f.path} is a ${kind} file and is not UTF-8 text`, `save ${f.path} as UTF-8`, f.path)); continue; }
    if (kind === "json") {
      /** @type {unknown} */
      let value;
      try { value = JSON.parse(text); } catch (e) { ds.push(diag("K018", `${f.from}'s file ${f.path} is not JSON (${/** @type {Error} */ (e).message})`, `fix the JSON in ${f.path}`, f.path)); continue; }
      data[f.path] = { path: f.path, kind, from: f.from, text, value };
    } else data[f.path] = { path: f.path, kind, from: f.from, text };
  }
  return { data, diagnostics: ds };
}
