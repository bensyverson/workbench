// Builds the legs' reference.md from the controls draft: the draft's API sections, with the answers
// (the three worked workbenches, the build plan, the open questions) cut, the rulings of 2026-11-27 that
// change the API applied, and the examples that name a workbench's own parts made generic.
// Usage: node scripts/controls-dogfood/build-reference.js [<draft path>] > reference.md
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DRAFT = fileURLToPath(new URL("../../project/2026-11-27-controls-draft.md", import.meta.url));

/** Second-level headings (exact text) whose sections are left out of the legs' copy. */
export const DROPPED = [
  "Three workbenches, with placeholders",
  "What retires",
  "Build plan (one agent)",
  "Open questions for Ben",
  "Rulings (Ben, 2026-11-27)",
  "Open questions from the dogfood (2026-11-27)",
];

/** [old, new] pairs applied in order; each old text must occur, so a draft edit that moves one is caught. */
/** @type {[string | RegExp, string][]} */
export const REPLACEMENTS = [
  [/^\*2026-11-27, leaf[^\n]*\n\n/m, ""],
  ["# Draft: declared controls", "# Reference: declared Controls (a draft; nothing here is built)"],
  ["the DMG host's pad and four buttons", "the host's fixed pad and four buttons"],
  [/^- \*\*H009 retires\*\*[^\n]*\n/m, ""],
  [/^- \*\*Lu11Q1 closes\.\*\*[^\n]*\n/m, ""],
  [" as the feasibility study proposes", ""],
  [/ This is a design choice that changes no ruling, so it stands, and Ben can overturn it[^\n]*/, ""],
  [" (the sequencer, and the Program-level UI backlog entry, whose trigger is met).", "."],
  ["so a Program that declares four operators gets four knobs", "so a Program that declares <n> constructs gets <n> Controls"],
  ["(the glasses on an nd/Vd map)", ""],
  ["a per-construct value such as an operator's ratio is any kind", "a value that belongs to each construct of a Program is any kind"],
  ["an envelope's point list is `points`", "a point list is `points`"],
  ["A pick of a glass that edits the source is one.", "A pick that edits the source is one."],
  ["This is how an optimizer's new design lands.", ""],
  ["the sequencer's shapes that the person plays", "shapes the person plays"],
  ["and the synth can be played, with frame latency, before it does", "and such a Control can be used, with frame latency, before it does"],
  ["a glyph's editor", "an editor"],
  ["The lens bench's charts can be Draw outputs in a tab.", "A chart can be a Draw output in a tab."],
  ["(the Book's page number)", ""],
  [/`latency: "audio"`/g, '`latency: "direct"`'],
  [/A Control may declare `latency: "direct"` \(U017 for any other value\)\./,
    'A Control may declare `latency: "direct"` (U017 for any other value). It means the input should bypass the frame loop and go straight to a part running at its own rate.'],
  [/Going straight to an audio-rate part, without the frame loop, is the audio runner's job[^.]*\./,
    "Going straight to a part running at its own rate is that runner's job, and no such runner exists yet."],
  [/Until that runner exists there is no audio-rate part to go to, so such a Control/, "Until it exists, such a Control"],
  [/`AudioContext.resume\(\)` once an audio runner exists/, "`AudioContext.resume()` once such a runner exists"],
  ["Data files do not reach a runtime today (feasibility gap 2), and that plumbing needs a ruling (open question 5).",
    "A runtime also gets the package's data files as `ctx.files` (this stage builds both)."],
];

/**
 * @param {string} draft
 * @returns {string}
 */
export function buildReference(draft) {
  const out = [];
  let skipping = false;
  for (const line of draft.split("\n")) {
    const h2 = /^## (.*)$/.exec(line);
    if (h2) skipping = DROPPED.includes(h2[1] ?? "");
    if (!skipping) out.push(line);
  }
  let text = out.join("\n");
  for (const [from, to] of REPLACEMENTS) {
    const hit = typeof from === "string" ? text.includes(from) : new RegExp(from.source, from.flags.replace("g", "")).test(text);
    if (!hit) throw new Error(`reference: replacement did not match: ${String(from).slice(0, 70)}`);
    text = typeof from === "string" ? text.split(from).join(to) : text.replace(from, () => to);
  }
  text = text.replace(/ ?\*Changed 2026-11-27 \(dogfood\)[^*]*\*/g, "").replace(/^> \*\*Dogfooded[^\n]*\n\n/m, "")
    .replace(/ Proposed by the dogfood[^.]*\./, "").replace(/ \(open questions? \d+\)/g, "").replace(/ \([^()]*open questions? \d+\)/g, "").replace(/ \(feasibility gap \d+\)/g, "");
  return text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n" + WIRING;
}

const WIRING = `
## Wiring a page Control, for reference

A glue program composes parts and wires outputs to inputs. This is the shape of its calls, as the compose documentation has it today:

\`\`\`js
export default ($) => {
  // ... parts built from their packages: <part> ...
  return compose("<name>")
    .part(<part>)
    .wire(page.out.<control>, <part>.in.<input>)
    .show(<part>.out.<output>, <part>.out.<output>);
};
\`\`\`

\`.show\` takes one output or several, which are layered. A part run alone is made by the host's preset helper: \`examplePreset(name, fn, build, { ui, wirePage })\`.
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildReference(readFileSync(process.argv[2] ?? DRAFT, "utf8")));
}
