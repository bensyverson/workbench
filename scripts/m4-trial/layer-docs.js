// Prepares a layer leg's copy of the kit docs (leaf teBNYM, revised at KYpY7Q and JBkhsf): run.sh layer copies the
// kit's docs as for every leg, then this edits the copies only, never the repository's.
//   node scripts/m4-trial/layer-docs.js <leg>/docs/kit
// The legs get the kit's docs as they are, withholding only the answer: compose/README.md's subsections "The M4
// trial's glue, with a layer" and "The M4 trial's HUD, anchored" (the anchored-edge draft's) hold this task's glue
// and panel offset with real names, so they are dropped from the leg's copy, each up to the next heading.
// Exits 1 when either subsection is not there, so a changed doc stops the leg rather than giving it the answer.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kit] = process.argv.slice(2);
if (!kit) { console.error("usage: node scripts/m4-trial/layer-docs.js <leg>/docs/kit"); process.exit(2); }

const HEADINGS = ["### The M4 trial's glue, with a layer", "### The M4 trial's HUD, anchored"];
const file = join(kit, "compose/README.md");
let text = readFileSync(file, "utf8");
for (const heading of HEADINGS) {
  const at = text.indexOf(heading);
  if (at < 0) { console.error(`layer-docs.js: compose/README.md has no "${heading}" subsection`); process.exit(1); }
  const next = text.slice(at + heading.length).search(/\n#{1,3} /);
  text = text.slice(0, at).trimEnd() + "\n" + (next < 0 ? "" : text.slice(at + heading.length + next));
}
writeFileSync(file, text);
