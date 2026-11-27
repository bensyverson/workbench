// Prepares a layer dogfood leg's copy of the kit docs (leaf teBNYM): run.sh layer copies the kit's docs as for every
// leg, then this edits the copies only, never the repository's.
//   node scripts/m4-trial/layer-docs.js <leg>/docs/kit
// - compose/README.md keeps its "Layers (draft)" section but loses the draft's own rewrite of the M4 glue (the
//   subsection "The M4 trial's glue, rewritten against this draft"), which is this leg's answer with real names;
// - START.md and API.md gain the two lines the drafter wrote for them (job teBNYM's integration note), marked draft;
// - API.md's "Not built" loses "a composed page that layers parts", as it will at layer-build.
// Exits 1 when an anchor is missing, so a changed doc stops the leg rather than giving it a half-edited set.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kit] = process.argv.slice(2);
if (!kit) { console.error("usage: node scripts/m4-trial/layer-docs.js <leg>/docs/kit"); process.exit(2); }

/** @param {string} file @param {(text: string) => string} edit */
function patch(file, edit) {
  const p = join(kit, file);
  writeFileSync(p, edit(readFileSync(p, "utf8")));
}
/** @param {string} text @param {string} anchor @param {string} replacement */
function replaceOnce(text, anchor, replacement) {
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0) { console.error(`layer-docs.js: the anchor is missing or not unique: ${anchor.slice(0, 80)}`); process.exit(1); }
  return text.slice(0, at) + replacement + text.slice(at + anchor.length);
}

const REWRITE_HEADING = "### The M4 trial's glue, rewritten against this draft";

patch("compose/README.md", (text) => {
  if (!text.includes("## Layers (draft")) { console.error("layer-docs.js: compose/README.md has no Layers (draft) section"); process.exit(1); }
  const at = text.indexOf(REWRITE_HEADING);
  if (at < 0) return text;
  const next = text.slice(at + REWRITE_HEADING.length).search(/\n#{1,3} /);
  return text.slice(0, at).trimEnd() + "\n" + (next < 0 ? "" : text.slice(at + REWRITE_HEADING.length + next));
});

patch("START.md", (text) => replaceOnce(text, "see [compose/README.md](compose/README.md).",
  'see [compose/README.md](compose/README.md). To draw one package\'s picture over another\'s, the glue layers them with no package of its own: `.show(<part>.out.<output>, <part>.out.<output>)`, bottom first, or `layer("<name>", <output>, <output>)` to wire or layer the result again (compose/README.md ▸ Layers (draft)).'));

patch("API.md", (text) => {
  const composing = text.indexOf("- **Composing** packages");
  const end = composing < 0 ? -1 : text.indexOf("\n", composing);
  if (end < 0) { console.error("layer-docs.js: API.md has no Composing bullet"); process.exit(1); }
  const line = " To layer pictures (draft: compose/README.md ▸ Layers (draft)), don't write a package: `.show(<part>.out.<output>, <part>.out.<output>, ...)` draws them bottom first as one, and `layer(\"<name>\", <part>.out.<output>, ...)`, imported from `kit/compose`, makes a part whose `.out.view` you can show, wire or layer again. Its ceiling and frame come from the producers (the bottom one's frame), so relate the other pictures' frames to the bottom one's with `.frame`.";
  const withLine = text.slice(0, end) + line + text.slice(end);
  return replaceOnce(withLine, ", a composed page that layers parts", "");
});
