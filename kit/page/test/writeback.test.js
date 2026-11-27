// @ts-nocheck: builder chains and records are generated, which TypeScript cannot follow here.
// Write-back (project/2026-11-27-controls-draft.md, requirement 8; build plan groups 44 to 47, 49b and 49): a release
// writes its value into the Program's text as a literal at the call kit/define's siteOf names, found with the
// vendored acorn; anything but a literal is refused (H011) with its text; a stale span is H012; and the record
// built from the edited text is the last preview's, so the part does not restart again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeBack, editSource, targetProblem } from "../index.js";
import { examplePreset } from "../index.js";
import { run, withScope, defineRuntime } from "../../define/index.js";
import { createRun } from "../../run/index.js";
import { HERE, g } from "../fixtures/synth-program.js";
import { SYNTH_INPUTS } from "../../define/fixtures/controls-dialects.js";

const HEAD = `import { g } from "${HERE}";\n`;
/** The default export of a Program text. @param {string} text */
const programFrom = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`)).default;
/** The text, its built record, and a write-back of one target. @param {string} body */
async function built(body) {
  const text = HEAD + body;
  const fn = await programFrom(text);
  const r = run(fn);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), []);
  return { text, fn, record: r.record, back: (/** @type {string} */ target, /** @type {unknown} */ value, o = {}) => writeBack(text, r.record, target, value, o) };
}

// the calls are numbered across the root's slots in declaration order: param, op, voices, env, k, tag, on
const BODY = `export default ($) => g("s")
  .param("gain", { value: 1, min: 0, max: 2 })
  .op("a", { ratio: 2, level: 0.5 })
  .op("b", {
    ratio: 3,
    level: 1,
  })
  .k(-3).k(7)
  .tag('hi')
  .on(true)
  .env([[0, 0], [1, 1]]);
`;

test("44. spans: a number, a negative number, a string, a boolean, inside an object and a list, over lines and in a chain; the epilogue moves none", async () => {
  const b = await built(BODY);
  const line = (/** @type {any} */ r, /** @type {RegExp} */ re) => { assert.equal(r.ok, true, r.message); return r.text.split("\n").find((l) => re.test(l)); };
  assert.equal(line(b.back("arg.s.op#1:1.ratio", 2.5), /"a"/), `  .op("a", { ratio: 2.5, level: 0.5 })`);
  assert.equal(line(b.back("arg.s.k#4:0", 4), /\.k\(/), "  .k(4).k(7)", "a negative number, the first of a chain");
  assert.equal(line(b.back("arg.s.k#5:0", -1), /\.k\(/), "  .k(-3).k(-1)", "the second of a chain");
  assert.equal(line(b.back("arg.s.tag#6:0", "yo"), /tag/), "  .tag('yo')", "a string keeps its quotes");
  assert.equal(line(b.back("arg.s.on#7:0", false), /\.on/), "  .on(false)");
  assert.equal(line(b.back("arg.s.op#2:1.level", 0.25), /level: 0\.25/), "    level: 0.25,", "a call split over lines");
  assert.equal(line(b.back("arg.s.env#3:0[1]", [0.5, 0.5]), /env/), "  .env([[0, 0], [0.5, 0.5]]);", "an item of a list");
  const whole = b.back("arg.s.op#1:1.ratio", 2.5);
  assert.equal(whole.text.replace("ratio: 2.5", "ratio: 2"), b.text, "nothing else changed");
  const scoped = run(await programFrom(withScope(b.text))).record;
  assert.equal(writeBack(b.text, scoped, "arg.s.op#1:1.ratio", 9).text, whole.text.replace("ratio: 2.5", "ratio: 9"), "the scope epilogue moves no span");
});

test("45. a name, a const, arithmetic, a template and a call are each H011 with their text; $.<name> retargets; a loop or a helper twice is H011", async () => {
  const b = await built(`const x = 2;\nconst n = "t";\nexport default ($) => g("s").param("gain", { value: 1, min: 0, max: 2 }).k(x).k(1 + 1).tag(\`\${n}!\`).k(Math.abs(-2)).k($.gain);\n`);
  const cases = [["arg.s.k#1:0", "x"], ["arg.s.k#2:0", "1 + 1"], ["arg.s.tag#5:0", "`${n}!`"], ["arg.s.k#3:0", "Math.abs(-2)"]];
  for (const [target, text] of cases) {
    const r = b.back(target, 3);
    assert.equal(r.ok, false, target);
    assert.equal(r.code, "H011");
    assert.ok(r.message.includes(text), `${target}: ${r.message}`);
    assert.match(r.fix, /write the literal at the call, or declare a param and pass \$\.<name>/);
    assert.equal(targetProblem(b.text, b.record, target).code, "H011");
  }
  const re = b.back("arg.s.k#4:0", 1.5);
  assert.equal(re.ok, true, re.message);
  assert.equal(re.retarget, "param.gain");
  assert.match(re.text, /\.param\("gain", \{ value: 1\.5, min: 0, max: 2 \}\)/);
  const loop = await built(`export default ($) => { let c = g("s"); for (const v of [1, 2]) c = c.k(v); return c; };\n`);
  assert.match(loop.back("arg.s.k#0:0", 3).message, /runs 2 times/);
  const helper = await built(`const add = (c, v) => c.k(v);\nexport default ($) => add(add(g("s"), 1), 2);\n`);
  assert.equal(helper.back("arg.s.k#1:0", 3).code, "H011");
});

test("46. editSource: shortest round-trip numbers or to the step, quotes kept, the rest unchanged, edits from the end, a stale span H012", () => {
  const text = `.k(1).tag("a").k(2)`;
  const r = editSource(text, [{ start: 3, end: 4, expect: "1", value: 0.1 + 0.2 }, { start: 17, end: 18, expect: "2", value: 0.30000000000000004, step: 0.1 }, { start: 10, end: 13, expect: `"a"`, value: "b" }]);
  assert.equal(r.ok, true);
  assert.equal(r.text, `.k(0.30000000000000004).tag("b").k(0.3)`);
  assert.equal(editSource(`.tag('a')`, [{ start: 5, end: 8, expect: "'a'", value: "it's" }]).text, `.tag('it\\'s')`);
  const stale = editSource(text, [{ start: 3, end: 4, expect: "9", value: 1 }]);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "H012");
});

test("47. a param's write-back replaces its declaration's value literal", async () => {
  const b = await built(BODY);
  const r = b.back("param.gain", 1.75);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.text.includes(`.param("gain", { value: 1.75, min: 0, max: 2 })`));
  assert.equal(b.back("param.nope", 1).code, "H011");
});

test("49b. a point list's write-back replaces the array literal whole; a ragged or computed one is H011", async () => {
  const b = await built(BODY);
  const r = b.back("arg.s.env#3:0", [[0, 0], [0.5, 1], [1, 0]]);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.text.includes(".env([[0, 0], [0.5, 1], [1, 0]]);"));
  assert.equal(b.back("arg.s.env#3:0", [0, 1]).code, "H011", "a list of another depth");
  const ragged = await built(`export default ($) => g("s").env([[0, 0], [1]]);\n`);
  assert.equal(ragged.back("arg.s.env#0:0", [[0, 0], [1, 1]]).code, "H011");
  const computed = await built(`const y = 1;\nexport default ($) => g("s").env([[0, 0], [1, y]]);\n`);
  assert.equal(computed.back("arg.s.env#0:0", [[0, 0], [1, 1]]).code, "H011");
});

test("49. after a release, the record built from the edited text is the last preview's: the part's revision does not bump again", async () => {
  const b = await built(BODY);
  const preset = examplePreset("synth", b.fn);
  const rt = defineRuntime(g, { clock: () => ({ tick: 1 }), init: () => ({ voices: 0, ops: [] }), step: (s) => s, events: { in: Object.fromEntries(Object.keys(SYNTH_INPUTS).map((n) => [n, 8])) } });
  const composed = preset.composition.build({ runtimes: [rt] });
  const r = createRun(composed, { runtimes: [rt] });
  r.runUntil(1);
  const preview = run(b.fn, { args: { "s.op#1:1.ratio": 4 } }).record;
  r.input({ kind: "rebuild", T: 1.5, part: "s", record: preview });
  r.runUntil(2);
  const revision = r.snapshot("s").revision;
  assert.equal(revision, 2, "the preview restarted the part once");
  const edited = b.back("arg.s.op#1:1.ratio", 4);
  const again = run(await programFrom(edited.text)).record;
  r.input({ kind: "rebuild", T: 2.5, part: "s", record: again });
  r.runUntil(3);
  assert.equal(r.snapshot("s").revision, revision, "the commit's record has the preview's content key");
});
