// `node scripts/seams-trial/reference.js <dir> <package>...`: the generated reference (kit/package's
// packageReference: each package's ports and frames) of each named package folder under <dir>, as Markdown on
// stdout. run.sh writes a compose leg's reference.md with it. Exit 0: written; 1: a package did not load; 2: usage.

import { join } from "node:path";
import { packageReference } from "../../kit/package/index.js";
import { loadPackageDir } from "./checker/load.js";

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  if (argv.length < 2 || argv.some((a) => a.startsWith("-"))) { console.error("usage: node scripts/seams-trial/reference.js <dir> <package>..."); return 2; }
  const [dir, ...names] = argv;
  /** @type {string[]} */
  const out = [];
  for (const name of names) {
    const r = await loadPackageDir(join(dir, name));
    if (!r.loaded.dialect) { console.error(`${name} did not load: ${r.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`); return 1; }
    out.push(packageReference(r.loaded));
  }
  console.log(out.join("\n\n"));
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
