// `node scripts/pkg/hash.js <dir>`: rewrites <dir>/wb-package.json's `files` with every file under <dir>.
// A thin CLI over kit/package's hashText; the logic worth testing is there.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MANIFEST_PATH } from "../../kit/package/index.js";
import { hashDir, PackageDirError } from "./dir.js";

const PRIMER = `usage: node scripts/pkg/hash.js <dir>

Rewrites <dir>/${MANIFEST_PATH}: its "files" becomes every file under <dir> (the manifest and dotfiles excluded),
sorted by path, each with its sha256-<base64> hash. Every other field is kept as written.
Run it after any change to a package's files. Exit 0: written. 2: bad invocation. 4: <dir> or its manifest is missing or not JSON.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); return 0; }
  if (argv.length !== 1 || argv[0].startsWith("-")) { console.error(PRIMER); return 2; }
  const dir = argv[0];
  try {
    const n = await hashDir(dir);
    console.log(`${join(dir, MANIFEST_PATH)}: ${n} files hashed`);
    return 0;
  } catch (e) {
    if (e instanceof PackageDirError) { console.error(`error: ${e.message}`); return 4; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
