// Reads the book's data out of the single-page app. The file is gitignored and never copied into the repo.
import { readFileSync } from "node:fs";

export const DEFAULT_BOOK = "/Users/ben/git/workbench/local/uncommon-math-0.1.0.html";

/**
 * @typedef {object} Sketch
 * @property {string} src @property {string} title @property {string} about @property {string} chapter
 * @typedef {object} Book
 * @property {{ n: number, title: string, body: string, sketches: string[] }[]} chapters
 * @property {Record<string, Sketch>} sketches
 * @property {Record<string, object>} demos
 */

/** @param {string} path @returns {Book} */
export function loadBook(path) {
  const html = readFileSync(path, "utf8");
  const m = /<script type="application\/json" id="book-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`${path}: no <script id="book-data"> block; is this the Uncommon Math page?`);
  return JSON.parse(m[1]);
}
