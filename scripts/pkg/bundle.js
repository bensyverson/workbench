// `node scripts/pkg/bundle.js <dir> > x.wb.json`: writes the folder as one bundle file, which the page reads as the
// same { path: text } map as a set of files. A thin CLI over kit/package's writeBundle.

import { pathToFileURL } from "node:url";
import { writeBundle } from "../../kit/package/index.js";
import { readPackageDir, PackageDirError } from "./dir.js";

const PRIMER = `usage: node scripts/pkg/bundle.js <dir> > <name>.wb.json

Writes every file under <dir> (the manifest included, dotfiles excluded) as one JSON bundle on stdout:
{ "format": "wb-bundle", "files": { "<path>": "<text>" } }. Run scripts/pkg/hash.js <dir> first so the manifest's hashes are current.
Exit 0: written. 2: bad invocation. 4: <dir> is missing.`;

/** @param {string[]} argv @returns {number} */
function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); return 0; }
  if (argv.length !== 1 || argv[0].startsWith("-")) { console.error(PRIMER); return 2; }
  try {
    process.stdout.write(writeBundle(readPackageDir(argv[0])));
    return 0;
  } catch (e) {
    if (e instanceof PackageDirError) { console.error(`error: ${e.message}`); return 4; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
