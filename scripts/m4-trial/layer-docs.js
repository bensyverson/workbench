// Prepares a layer leg's copy of the kit docs (leaf teBNYM, revised at KYpY7Q): run.sh layer copies the kit's docs as
// for every leg, then this edits the copies only, never the repository's.
//   node scripts/m4-trial/layer-docs.js <leg>/docs/kit
// The legs get the kit's docs as they are, withholding only the answer: compose/README.md's subsection "The M4
// trial's glue, with a layer" is this task's glue with real names, so it is dropped from the leg's copy.
// Exits 1 when the subsection is not there, so a changed doc stops the leg rather than giving it the answer.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kit] = process.argv.slice(2);
if (!kit) { console.error("usage: node scripts/m4-trial/layer-docs.js <leg>/docs/kit"); process.exit(2); }

const HEADING = "### The M4 trial's glue, with a layer";
const file = join(kit, "compose/README.md");
const text = readFileSync(file, "utf8");
const at = text.indexOf(HEADING);
if (at < 0) { console.error(`layer-docs.js: compose/README.md has no "${HEADING}" subsection`); process.exit(1); }
const next = text.slice(at + HEADING.length).search(/\n#{1,3} /);
writeFileSync(file, text.slice(0, at).trimEnd() + "\n" + (next < 0 ? "" : text.slice(at + HEADING.length + next)));
