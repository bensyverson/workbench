// Adds the draft tests lines to a blind leg's copies of kit/START.md and kit/API.md (leaf mxxKTa), as the tests draft's
// integration note words them (job leaf mxxKTa, from tests-draft-36), marked draft:
//   node scripts/m4-trial/tests-dogfood/patch-docs.js <docs/kit folder>
// Never run it on the repository's kit/: the real docs gain these lines at tests-build.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_ANCHOR = "\n## When the API can't express something";
const START_STEP = `6. **Test your runtime with the kit, not a harness.** If your package has a runtime, list tests in your manifest's \`tests\` (draft): each names an example, gives timed records on your named Event inputs (\`{ "T": <seconds>, "in": "<input>", "value": { <field>: <value> } }\`) and says what to expect (state at an instant, the records your Event output pushed, a run diagnostic). The check runs them and reports H006–H008. Don't stub \`defineRuntime\` or call \`step\` yourself. API.md ▸ A runtime, "Testing it".
`;

const API_ANCHOR = "- **Every Event port needs its max** in `events` (D033). The composition sizes each queue from the maxes and the clocks, and refuses a reliable wire that could overflow (S116).\n";
const API_TESTING = `- **Testing it** (draft, not built: [package/README.md](package/README.md) ▸ Tests). A test is data in your manifest, not code: the kit runs one example alone, sends your records, and checks what you expect.

  \`\`\`json
  "tests": [
    { "name": "<test>", "example": "<example>.js",
      "inputs": [ { "T": <seconds>, "in": "<input>", "value": { "<field>": <value> } } ],
      "expect": [
        { "at": <seconds>, "state": { "<path>": <value> } },
        { "events": "<output>", "from": <seconds>, "to": <seconds>, "records": [ { "<field>": <value> } ] },
        { "diagnostic": "<code>" }
      ] }
  ]
  \`\`\`

  - A record is in your input's own seam, as \`ctx.inputs.<input>\` reads it; a field with a default may be left out. It reaches your step at the first instant at or after \`T\`, with \`$T\` equal to \`T\`.
  - \`<path>\` names a state value as checkState does (\`<field>.<field>\`, \`<list>[<i>]\`) or \`<list>.length\`, and \`at\` reads the state after every instant up to it.
  - A run error you don't list fails the test (H007); an expectation not met is H006, naming the test, the instant, what was expected and what came.
`;

/** @param {string} path @param {string} anchor @param {(text: string) => string} edit */
function patch(path, anchor, edit) {
  const text = readFileSync(path, "utf8");
  if (text.split(anchor).length !== 2) throw new Error(`patch-docs: ${path} does not hold its anchor exactly once`);
  writeFileSync(path, edit(text));
}

const dir = process.argv[2];
if (!dir) { console.error("usage: patch-docs.js <docs/kit folder>"); process.exit(2); }
patch(join(dir, "START.md"), START_ANCHOR, (t) => t.replace(START_ANCHOR, () => `${START_STEP}${START_ANCHOR}`));
patch(join(dir, "API.md"), API_ANCHOR, (t) => t.replace(API_ANCHOR, () => `${API_ANCHOR}${API_TESTING}`));
