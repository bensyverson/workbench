// @ts-nocheck: builder chains and records are generated, which TypeScript cannot follow here.
// Write-back (project/2026-11-27-controls-draft.md, requirement 8; build plan groups 44 to 47, 49b and 49): a release
// writes its value into the Program's text as a literal at the call kit/define's siteOf names, found with the
// vendored acorn; anything but a literal is refused (H011) with its text; a stale span is H012; and the record
// built from the edited text is the last preview's, so the part does not restart again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeBack, writeBackAll, editSource, targetProblem, printNumber } from "../index.js";
import { examplePreset } from "../index.js";
import { run, withScope, defineRuntime } from "../../define/index.js";
import { createRun } from "../../run/index.js";
import { HERE, g } from "../fixtures/synth-program.js";
import { lens, HERE as LENS } from "../fixtures/lens-program.js";
import { HERE as OPTIONAL } from "../fixtures/optional-arg-program.js";
import { callGlue } from "../../compose/index.js";
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

// each slot numbers its own calls (Ref ids, kit/define): op#0 and op#1, k#0 and k#1, env#0, tag#0, on#0
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
  assert.equal(line(b.back("arg.s.op#0:1.ratio", 2.5), /"a"/), `  .op("a", { ratio: 2.5, level: 0.5 })`);
  assert.equal(line(b.back("arg.s.k#0:0", 4), /\.k\(/), "  .k(4).k(7)", "a negative number, the first of a chain");
  assert.equal(line(b.back("arg.s.k#1:0", -1), /\.k\(/), "  .k(-3).k(-1)", "the second of a chain");
  assert.equal(line(b.back("arg.s.tag#0:0", "yo"), /tag/), "  .tag('yo')", "a string keeps its quotes");
  assert.equal(line(b.back("arg.s.on#0:0", false), /\.on/), "  .on(false)");
  assert.equal(line(b.back("arg.s.op#1:1.level", 0.25), /level: 0\.25/), "    level: 0.25,", "a call split over lines");
  assert.equal(line(b.back("arg.s.env#0:0[1]", [0.5, 0.5]), /env/), "  .env([[0, 0], [0.5, 0.5]]);", "an item of a list");
  const whole = b.back("arg.s.op#0:1.ratio", 2.5);
  assert.equal(whole.text.replace("ratio: 2.5", "ratio: 2"), b.text, "nothing else changed");
  const scoped = run(await programFrom(withScope(b.text))).record;
  assert.equal(writeBack(b.text, scoped, "arg.s.op#0:1.ratio", 9).text, whole.text.replace("ratio: 2.5", "ratio: 9"), "the scope epilogue moves no span");
});

test("45. a name, a const, arithmetic, a template and a call are each H011 with their text; $.<name> retargets; a loop or a helper twice is H011", async () => {
  const b = await built(`const x = 2;\nconst n = "t";\nexport default ($) => g("s").param("gain", { value: 1, min: 0, max: 2 }).k(x).k(1 + 1).tag(\`\${n}!\`).k(Math.abs(-2)).k($.gain);\n`);
  const cases = [["arg.s.k#0:0", "x"], ["arg.s.k#1:0", "1 + 1"], ["arg.s.tag#0:0", "`${n}!`"], ["arg.s.k#2:0", "Math.abs(-2)"]];
  for (const [target, text] of cases) {
    const r = b.back(target, 3);
    assert.equal(r.ok, false, target);
    assert.equal(r.code, "H011");
    assert.ok(r.message.includes(text), `${target}: ${r.message}`);
    assert.match(r.fix, /write the literal at the call, or declare a param and pass \$\.<name>/);
    assert.equal(targetProblem(b.text, b.record, target).code, "H011");
  }
  const re = b.back("arg.s.k#3:0", 1.5);
  assert.equal(re.ok, true, re.message);
  assert.equal(re.retarget, "param.gain");
  assert.match(re.text, /\.param\("gain", \{ value: 1\.5, min: 0, max: 2 \}\)/);
  const loop = await built(`export default ($) => { let c = g("s"); for (const v of [1, 2]) c = c.k(v); return c; };\n`);
  assert.match(loop.back("arg.s.k#0:0", 3).message, /runs 2 times/);
  const helper = await built(`const add = (c, v) => c.k(v);\nexport default ($) => add(add(g("s"), 1), 2);\n`);
  assert.equal(helper.back("arg.s.k#1:0", 3).code, "H011");
});

test("46. editSource: numbers to the step, or with none to the digits a double holds (ZNpW0f), quotes kept, the rest unchanged, edits from the end", () => {
  const text = `.k(1).tag("a").k(2)`;
  const r = editSource(text, [{ start: 3, end: 4, expect: "1", value: 0.1 + 0.2 }, { start: 17, end: 18, expect: "2", value: 0.30000000000000004, step: 0.1 }, { start: 10, end: 13, expect: `"a"`, value: "b" }]);
  assert.equal(r.ok, true);
  assert.equal(r.text, `.k(0.3).tag("b").k(0.3)`);
  assert.equal(editSource(`.tag('a')`, [{ start: 5, end: 8, expect: "'a'", value: "it's" }]).text, `.tag('it\\'s')`);
});

test("46. a stale text is H012 through writeBack: an edited literal, a line removed above, another method at the place; the text the record came from, and a preview's record, still write", async () => {
  const b = await built(BODY);
  const stale = (/** @type {string} */ text, /** @type {string} */ why) => {
    const r = writeBack(text, b.record, "arg.s.op#0:1.ratio", 4);
    assert.equal(r.ok, false, `${why}: ${r.ok ? r.text : ""}`);
    assert.equal(r.code, "H012", `${why}: ${r.message}`);
  };
  stale(b.text.replace("ratio: 2,", "ratio: 7,"), "the person typed 7 over the literal the record holds");
  stale(b.text.replace(`  .param("gain", { value: 1, min: 0, max: 2 })\n`, ""), "a line above was removed, so op b sits at op a's place");
  stale(b.text.replace(`  .op("a", { ratio: 2, level: 0.5 })`, `  .tag({ ratio: 2, level: 0.5 })`), "another method at the place");
  assert.equal(writeBack(b.text.replace("ratio: 3,", "ratio: 8,"), b.record, "arg.s.op#1:1.ratio", 4).code, "H012", "a nested literal edited");
  // what must still work: the text the record was built from, and the record of a preview built with the override
  assert.equal(b.back("arg.s.op#0:1.ratio", 4).ok, true);
  const preview = run(b.fn, { args: { "s.op#0:1.ratio": 6 } }).record;
  const r = writeBack(b.text, preview, "arg.s.op#0:1.ratio", 6);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.text.includes(`.op("a", { ratio: 6, level: 0.5 })`));
  const list = run(b.fn, { args: { "s.env#0:0[1]": [0.5, 0.5] } }).record;
  assert.equal(writeBack(b.text, list, "arg.s.env#0:0", [[0, 0], [0.5, 0.5]]).ok, true, "a preview of an item, then the whole list written");
  assert.equal(b.back("param.gain", 1.5).ok, true);
  assert.equal(writeBack(b.text.replace("value: 1,", "value: 2,"), b.record, "param.gain", 1.5).code, "H012", "a param's literal edited");
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
  const r = b.back("arg.s.env#0:0", [[0, 0], [0.5, 1], [1, 0]]);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.text.includes(".env([[0, 0], [0.5, 1], [1, 0]]);"));
  assert.equal(b.back("arg.s.env#0:0", [0, 1]).code, "H011", "a list of another depth");
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
  const preview = run(b.fn, { args: { "s.op#0:1.ratio": 4 } }).record;
  r.input({ kind: "rebuild", T: 1.5, part: "s", record: preview });
  r.runUntil(2);
  const revision = r.snapshot("s").revision;
  assert.equal(revision, 2, "the preview restarted the part once");
  const edited = b.back("arg.s.op#0:1.ratio", 4);
  const again = run(await programFrom(edited.text)).record;
  r.input({ kind: "rebuild", T: 2.5, part: "s", record: again });
  r.runUntil(3);
  assert.equal(r.snapshot("s").revision, revision, "the commit's record has the preview's content key");
});

test("45. a glue helper that makes two parts holds one literal for both: either part's write-back is H011; a call of each part's own still writes", async () => {
  const COMPOSE = new URL("../../compose/index.js", import.meta.url).href;
  const head = `import { g } from "${LENS}";\nimport { compose } from "${COMPOSE}";\n`;
  const helper = head + `const mk = (n) => g(n).lens({ radius: 10, at: [1, 2] });\nexport default ($) => { const a = mk("a"), b = mk("b"); return compose("w").part(a).part(b); };\n`;
  const composed = callGlue(await programFrom(helper), "workbench.js").composition.build({ runtimes: [lens.runtime] });
  for (const part of ["a", "b"]) {
    const record = composed.parts.find((p) => p.name === part).record;
    const r = writeBack(helper, record, `arg.${part}.lens#0:0.radius`, 20);
    assert.equal(r.ok, false, `${part}: ${r.ok ? r.text : ""}`);
    assert.equal(r.code, "H011");
    assert.match(r.message, /runs 2 times/);
    assert.equal(targetProblem(helper, record, `arg.${part}.lens#0:0.radius`)?.code, "H011");
  }
  const own = head + `export default ($) => compose("w").part(g("a").lens({ radius: 10, at: [1, 2] })).part(g("b").lens({ radius: 10, at: [1, 2] }));\n`;
  const each = callGlue(await programFrom(own), "workbench.js").composition.build({ runtimes: [lens.runtime] });
  const w = writeBack(own, each.parts.find((p) => p.name === "b").record, "arg.b.lens#0:0.radius", 20);
  assert.equal(w.ok, true, w.message);
  assert.ok(w.text.includes(`g("a").lens({ radius: 10,`) && w.text.includes(`g("b").lens({ radius: 20,`), w.text);
});

test("46. edits that overlap are refused, H011: one target twice, and a list with a point inside it; side by side they still apply", async () => {
  const b = await built(BODY);
  const twice = writeBackAll(b.text, b.record, [{ to: "arg.s.k#0:0", value: 12345 }, { to: "arg.s.k#0:0", value: 2 }]);
  assert.deepEqual([twice.ok, twice.code], [false, "H011"]);
  assert.match(twice.message, /overlap/);
  const inside = writeBackAll(b.text, b.record, [{ to: "arg.s.env#0:0", value: [[0, 0], [0.5, 0.5], [1, 1]] }, { to: "arg.s.env#0:0[1]", value: [9, 9] }]);
  assert.deepEqual([inside.ok, inside.code], [false, "H011"]);
  assert.equal(editSource(".k(1)", [{ start: 3, end: 4, expect: "1", value: 2 }, { start: 3, end: 4, expect: "1", value: 3 }]).code, "H011", "editSource itself");
  const beside = writeBackAll(b.text, b.record, [{ to: "arg.s.k#0:0", value: 4 }, { to: "arg.s.k#1:0", value: 8 }, { to: "arg.s.env#0:0[0]", value: [1, 2] }, { to: "arg.s.env#0:0[1]", value: [3, 4] }]);
  assert.equal(beside.ok, true, beside.message);
  assert.ok(beside.text.includes(".k(4).k(8)") && beside.text.includes(".env([[1, 2], [3, 4]]);"), beside.text);
});

test("46. a string with a carriage return is written escaped, so the text reads back as the value; a step in exponent form gives its decimals", async () => {
  for (const quote of [`"`, `'`]) {
    const b = await built(`export default ($) => g("s").tag(${quote}x${quote});\n`);
    for (const value of ["cr\rhere", "crlf\r\nhere", "line\nbreak", "tab\there"]) {
      const r = b.back("arg.s.tag#0:0", value);
      assert.equal(r.ok, true, r.message);
      assert.equal(run(await programFrom(r.text)).record.tag[0], value, `${quote} ${JSON.stringify(value)}: ${r.text}`);
    }
  }
  assert.equal(printNumber(1.23456e-7, 1e-7), "1e-7");
  assert.equal(printNumber(2.4e-8, 1e-8), "2e-8");
  assert.equal(printNumber(2.5e-9, 5e-10), "2.5e-9", "a step with decimals of its own");
  assert.equal(printNumber(0.30000000000000004, 0.1), "0.3", "as it was");
  assert.equal(printNumber(12.5, 5), "15", "a half rounds up, as a Grip's step does");
  assert.equal(printNumber(0.1 + 0.2), "0.3", "no step: the 15 digits a double holds, so float noise is not written (ZNpW0f)");
  assert.equal(printNumber(29.400000000000006), "29.4", "a Grip release with no step (ZNpW0f)");
  assert.equal(printNumber(1 / 3), "0.333333333333333");
  assert.equal(printNumber(123456789012), "123456789012");
  assert.equal(printNumber(-0), "0");
});

test("8XU2O2. a call that moved onto a neighbor with the same slot and target literal is H012 when anything else it holds differs: its name literal, or another literal; the unedited text and a line moved intact still write", async () => {
  const TWINS = `export default ($) => g("s")
  .op("a", { ratio: 2, level: 0.5 })
  .op("b", { ratio: 2, level: 0.5 });
`;
  const b = await built(TWINS);
  assert.equal(b.back("arg.s.op#0:1.ratio", 4).ok, true, "the text the record was built from");
  const gone = HEAD + TWINS.replace(`  .op("a", { ratio: 2, level: 0.5 })\n`, "");
  const w = writeBack(gone, b.record, "arg.s.op#0:1.ratio", 4);
  assert.equal(w.ok === false && w.code, "H012", "op b now stands where op a was: same slot, same ratio, but its name literal differs (8XU2O2b: the lens, told apart by no name at all)");
  const renamed = writeBack(HEAD + TWINS.replace(`.op("a"`, `.op("z"`), b.record, "arg.s.op#0:1.ratio", 4);
  assert.equal(renamed.ok === false && renamed.code, "H012", "the name literal changed");
  const below = HEAD + TWINS.replace(`level: 0.5 })\n  .op("b"`, `level: 0.5 })\n  // c\n  .op("b"`);
  assert.equal(writeBack(below, b.record, "arg.s.op#0:1.ratio", 4).ok, true, "a comment below changes nothing the call holds");
  const other = writeBack(HEAD + TWINS.replace(`ratio: 2, level: 0.5 })\n  .op("b"`, `ratio: 2, level: 0.7 })\n  .op("b"`), b.record, "arg.s.op#0:1.ratio", 4);
  assert.equal(other.ok === false && other.code, "H012", "a literal beside the target changed (an object argument's other keys are compared)");
  const twins = await built(`export default ($) => g("s")\n  .k(3).k(3);\n`);
  assert.equal(writeBack(HEAD + `export default ($) => g("s")\n  .k(3);\n`, twins.record, "arg.s.k#0:0", 9).ok, true, "calls identical in every literal cannot be told apart: the survivor is written");
});

test("8XU2O2b. the same-slot, same-target, same-name neighbor is told apart by its other keys: delete the first of two calls and the survivor is stale, not written", async () => {
  const text = (body) => `import { g } from "${LENS}";\nexport default ($) => g("b")\n${body};\n`;
  const BOTH = `  .lens({ radius: 10, at: [20, 30] })\n  .lens({ radius: 10, at: [60, 70] })`;
  const SECOND = `  .lens({ radius: 10, at: [60, 70] })`;
  const r = run(await programFrom(text(BOTH)));
  assert.ok(r.record, "the bench builds");
  assert.equal(writeBack(text(BOTH), r.record, "arg.b.lens#0:0.radius", 33).ok, true, "the text the record was built from");
  const gone = writeBack(text(SECOND), r.record, "arg.b.lens#0:0.radius", 33);
  assert.equal(gone.ok === false && gone.code, "H012", "the survivor's `at` is not the first call's");
  assert.match(gone.ok ? "" : gone.message, /\[60, 70\]/);
  const moved = text(`  .lens({ at: [20, 30], radius: 10 })\n  .lens({ radius: 10, at: [60, 70] })`);
  assert.equal(writeBack(moved, r.record, "arg.b.lens#0:0.radius", 33).ok, true, "the same keys in another order are the same call");
  const nested = writeBack(text(`  .lens({ radius: 10, at: [20, 31] })\n  .lens({ radius: 10, at: [60, 70] })`), r.record, "arg.b.lens#0:0.radius", 33);
  assert.equal(nested.ok === false && nested.code, "H012", "a changed list element is a changed call");
  const own = writeBack(text(BOTH), r.record, "arg.b.lens#0:0.at[1]", 31);
  assert.equal(own.ok, true, "a target inside the list is skipped, its siblings compared");
  assert.equal(writeBack(text(`  .lens({ radius: 10, at: [20, 99] })\n  .lens({ radius: 10, at: [60, 70] })`), r.record, "arg.b.lens#0:0.at[1]", 31).ok, false, "the target's own literal is stale as ever");
  assert.equal(writeBack(text(`  .lens({ radius: 10, at: [21, 30] })\n  .lens({ radius: 10, at: [60, 70] })`), r.record, "arg.b.lens#0:0.at[1]", 31).ok === false, true, "a sibling element of the target changed");
});

test("8XU2O2c. a call written with an explicit trailing undefined is the call the record made", async () => {
  const text = (call) => `import { g } from "${OPTIONAL}";\nexport default ($) => g("o")\n  ${call};\n`;
  const r = run(await programFrom(text(".mark({ size: 10 }, undefined)")));
  assert.ok(r.record, r.diagnostics.map((d) => d.message).join(" "));
  const w = writeBack(text(".mark({ size: 10 }, undefined)"), r.record, "arg.o.mark#0:0.size", 33);
  assert.equal(w.ok, true, w.ok ? "" : w.message);
  assert.equal(writeBack(text(".mark({ size: 10 }, 7)"), r.record, "arg.o.mark#0:0.size", 33).ok, false, "a real extra argument is still a changed call");
});

test("0sZBNV. a param write against a record built with values is not stale: the text still holds the declared value", async () => {
  const b = await built(BODY);
  const withValues = run(b.fn, { values: { gain: 1.7 } }).record;
  const w = writeBack(b.text, withValues, "param.gain", 1.5);
  assert.equal(w.ok, true, w.ok ? "" : w.message);
  assert.match(w.ok ? w.text : "", /\.param\("gain", \{ value: 1\.5,/);
  const stale = writeBack(b.text.replace("value: 1,", "value: 1.2,"), withValues, "param.gain", 1.5);
  assert.equal(stale.ok === false && stale.code, "H012", "an edited declaration is still stale");
});
