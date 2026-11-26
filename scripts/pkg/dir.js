// Reads a package folder into the { path: text } map kit/package works on (the Node side of "files the host holds").

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashText, MANIFEST_PATH } from "../../kit/package/index.js";

/** A folder that is missing, or has no readable manifest. */
export class PackageDirError extends Error {}

/**
 * Every file under `dir` except dotfiles (a path part starting with `.`), as { path: text }, paths sorted.
 * @param {string} dir
 * @returns {Record<string, string>}
 */
export function readPackageDir(dir) {
  let st;
  try { st = statSync(dir); } catch { throw new PackageDirError(`${dir} does not exist`); }
  if (!st.isDirectory()) throw new PackageDirError(`${dir} is not a directory`);
  /** @type {string[]} */
  const paths = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) paths.push(p);
    }
  };
  walk("");
  return Object.fromEntries(paths.sort().map((p) => [p, readFileSync(join(dir, p), "utf8")]));
}

/**
 * Rewrites `<dir>/wb-package.json`'s `files` with every file under `dir`, sorted, each hashed; every other field is kept.
 * @param {string} dir
 * @returns {Promise<number>} how many files it hashed
 */
export async function hashDir(dir) {
  const files = readPackageDir(dir);
  const path = join(dir, MANIFEST_PATH);
  /** @type {any} */
  let manifest;
  try { manifest = JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    const missing = /** @type {NodeJS.ErrnoException} */ (e).code === "ENOENT";
    throw new PackageDirError(missing ? `${path} does not exist; write one with name, version, kit and entry, then run this again` : `${path} is not valid JSON (${/** @type {Error} */ (e).message})`);
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) throw new PackageDirError(`${path} is not a JSON object`);
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [p, t] of Object.entries(files)) if (p !== MANIFEST_PATH) hashes[p] = await hashText(t);
  manifest.files = hashes;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
  return Object.keys(hashes).length;
}
