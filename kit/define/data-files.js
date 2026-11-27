// A Dialect's data files (the package format draft's ruling of 2026-11-26, leaf hca0YM, and its "Data files, as
// built"): `files: { <name>: { kind, path, note } }` names each data file the Dialect reads, by its package path,
// with a kind that tells the host how to decode it; an image's `file` (kit/draw's `images`, J003) is a file of kind
// image. defineDialect checks the shape here (D034); kit/package checks each file when the package loads.

import { didYouMean } from "./codes.js";
import { isPlainObject } from "./tags.js";

/** Every data kind: `files` takes the first three; an image's `file` is the fourth. */
export const DATA_KINDS = Object.freeze(["text", "json", "csv", "image"]);
const FILE_KINDS = DATA_KINDS.filter((k) => k !== "image");
const FILE_KEYS = ["kind", "path", "note"];
const IMAGE_TIP = 'images: { <image>: { size: [<w>, <h>], cell?: [<cw>, <ch>], file: "<path>.png", note } }';
const TIP = 'files: { <name>: { kind: "text" | "json" | "csv", path: "<path>", note: "<what it holds>" } }';

/** @typedef {{ path: string, kind: string, from: string }} DataFile */
/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string }} Problem */

/** Whether `p` names a package module, which is never data. @param {string} p */
const isModule = (p) => p.endsWith(".js");

/**
 * The problems with a Dialect's `files` declaration, and with a path two declarations both name (D034). An image's
 * own `file` is kit/draw's checkPaint's (J003); here it only counts toward a path named twice.
 * @param {Record<string, any>} def @returns {Problem[]}
 */
export function checkDataFiles(def) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {Array<string | number>} */ path, /** @type {string} */ message, tip = TIP) => out.push({ code: "D034", path, message, tip });
  const files = def.files;
  if (files === undefined) return out;
  if (!isPlainObject(files)) { add(["files"], `files must be an object of names to { kind, path, note }, not ${Array.isArray(files) ? "a list" : typeof files}.`); return out; }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const [n, f] of Object.entries(/** @type {Record<string, any>} */ (files))) {
    const at = ["files", n];
    if (!isPlainObject(f)) { add(at, `files.${n} must be { kind, path, note }, not ${JSON.stringify(f) ?? typeof f}.`); continue; }
    for (const k of Object.keys(f)) if (!FILE_KEYS.includes(k)) add([...at, k], `files.${n} has no key '${k}'.${didYouMean(k, FILE_KEYS)}`);
    if (f.kind === "image") add([...at, "kind"], `files.${n} is an image: a picture is declared once, in images, with its file`, IMAGE_TIP);
    else if (!FILE_KINDS.includes(String(f.kind))) add([...at, "kind"], `files.${n}.kind is ${JSON.stringify(f.kind)}; a data file's kind is ${FILE_KINDS.slice(0, -1).join(", ")} or ${FILE_KINDS.at(-1)} (an image is declared in images)`);
    if (typeof f.path !== "string" || f.path === "") add([...at, "path"], `files.${n} needs path, the file's path in the package`);
    else if (isModule(f.path)) add([...at, "path"], `files.${n}.path is "${f.path}", a module: a package's .js files are its code, never data`);
    else if (seen.has(f.path)) add([...at, "path"], `files.${n}.path is "${f.path}", which ${seen.get(f.path)} already names: declare a data file once`);
    else seen.set(f.path, `files.${n}`);
    if (typeof f.note !== "string" || f.note.trim() === "") add([...at, "note"], `files.${n} needs note, a sentence saying what the file holds`);
  }
  for (const [n, img] of Object.entries(/** @type {Record<string, any>} */ (isPlainObject(def.images) ? def.images : {}))) {
    const p = isPlainObject(img) ? img.file : undefined;
    if (typeof p === "string" && seen.has(p)) add(["images", n, "file"], `images.${n}.file is "${p}", which ${seen.get(p)} already names: declare a data file once`, IMAGE_TIP);
  }
  return out;
}

/**
 * Every data file a Dialect reads: its `files` entries, then each image with a `file`, in declaration order.
 * @param {{ def: Record<string, any> }} dialect @returns {DataFile[]}
 */
export function dataFiles(dialect) {
  const def = dialect.def ?? {};
  /** @type {DataFile[]} */
  const out = [];
  for (const [n, f] of Object.entries(/** @type {Record<string, any>} */ (def.files ?? {}))) out.push({ path: f.path, kind: f.kind, from: `files.${n}` });
  for (const [n, img] of Object.entries(/** @type {Record<string, any>} */ (def.images ?? {}))) if (typeof img?.file === "string") out.push({ path: img.file, kind: "image", from: `images.${n}` });
  return out;
}
