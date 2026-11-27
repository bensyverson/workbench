// @ts-nocheck: builder chains and records are generated, which TypeScript cannot follow here.
// The editor stage's model (project/2026-11-27-controls-draft.md, requirements 8 and 9): the Program's text and its
// history. A release, an action's edits and an applied edit are each one step, written with kit/page's writeBack and
// put in force by the host's rebuild; a refused write (H011, a stale text H012, a text that no longer builds H012) is
// a listed diagnostic and keeps nothing; an undo builds the previous text. The lens bench's Program text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../../define/index.js";
import { HERE as LENS } from "../../fixtures/lens-program.js";
import { createEditor } from "../editor.js";

const HEAD = `import { g } from "${LENS}";\n`;
const TEXT = HEAD + `export default ($) => g("b")
  .lens({ radius: 10, at: [20, 30] })
  .lens({ radius: 25, at: [60, 70] });
`;
const recordOf = async (text) => run((await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`)).default).record;

/** An editor whose rebuild builds the text and keeps its record in force; `refuse(text)` makes a rebuild fail. */
async function bench(text = TEXT, refuse = () => null) {
  let record = await recordOf(text);
  const built = [];
  const editor = createEditor({
    text,
    recordOf: () => record,
    rebuild: async (t) => {
      built.push(t);
      const no = refuse(t);
      if (no) return { ok: false, diagnostics: [no] };
      record = await recordOf(t);
      return { ok: true };
    },
  });
  return { editor, built, record: () => record, setRecord: (r) => { record = r; } };
}

test("a release writes its literal into the text, puts the text in force, and is one undo step", async () => {
  const b = await bench();
  const r = await b.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(b.editor.text, /\.lens\(\{ radius: 14, at: \[20, 30\] \}\)/);
  assert.equal(b.editor.text.replace("radius: 14", "radius: 10"), TEXT, "nothing else changed");
  assert.deepEqual(b.built, [b.editor.text], "the edited text was built");
  assert.equal(b.editor.canUndo, true);
  assert.equal(b.record().lens[0].radius, 14, "the record in force is the new text's");
  const same = await b.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  assert.deepEqual([same.ok, same.changed], [true, false], "the same value is no step and no build");
  assert.equal(b.built.length, 1);
});

test("a refused write is a listed diagnostic and keeps nothing: a computed argument (H011), a stale text (H012), a text that no longer builds (H012)", async () => {
  const computed = HEAD + `const r = 10;\nexport default ($) => g("b").lens({ radius: r, at: [20, 30] });\n`;
  const c = await bench(computed);
  const h011 = await c.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  assert.equal(h011.ok, false);
  assert.equal(h011.diagnostics[0].code, "H011");
  assert.match(h011.diagnostics[0].message, /`r`/, "it names the expression");
  assert.equal(h011.diagnostics[0].severity, "warning", "H011 is a warning");
  assert.equal(c.editor.text, computed);
  assert.deepEqual([c.built.length, c.editor.canUndo], [0, false]);

  const s = await bench();
  s.setRecord(await recordOf(TEXT.replace("radius: 10", "radius: 11")));
  const stale = await s.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  assert.equal(stale.ok, false);
  assert.equal(stale.diagnostics[0].code, "H012");
  assert.equal(stale.diagnostics[0].severity, "error");
  assert.equal(s.editor.text, TEXT);

  const n = await bench(TEXT, (t) => (t.includes("radius: 14") ? { code: "B004", severity: "error", message: "radius 14 is refused by the Dialect" } : null));
  const broke = await n.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  assert.equal(broke.ok, false);
  assert.equal(broke.diagnostics[0].code, "H012");
  assert.match(broke.diagnostics[0].message, /does not build.*B004/);
  assert.deepEqual([n.editor.text, n.editor.canUndo], [TEXT, false], "the text is unchanged and no step is kept");
});

test("undo builds the previous text and redo the next; a new edit after an undo drops the redo", async () => {
  const b = await bench();
  await b.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 14 });
  const second = b.editor.text;
  await b.editor.write({ part: "b", to: "arg.b.lens#1:0.radius", value: 30 });
  const u = await b.editor.undo();
  assert.equal(u.ok, true);
  assert.equal(b.editor.text, second);
  assert.equal(b.built.at(-1), second, "the undo was built (an undo is an edit, not a rewind)");
  assert.equal(b.record().lens[1].radius, 25);
  await b.editor.redo();
  assert.equal(b.record().lens[1].radius, 30);
  await b.editor.undo();
  await b.editor.write({ part: "b", to: "arg.b.lens#1:0.at", value: [50, 50] });
  assert.equal(b.editor.canRedo, false, "the redo is dropped");
  assert.match(b.editor.text, /radius: 14, at: \[20, 30\][\s\S]*radius: 25, at: \[50, 50\]/);
  await b.editor.undo(); await b.editor.undo();
  assert.equal(b.editor.text, TEXT);
  assert.deepEqual(await b.editor.undo(), { ok: true, text: TEXT, changed: false }, "nothing to undo");
});

test("Apply builds the person's text as one step; a text that does not build is its own diagnostics and keeps the history", async () => {
  const b = await bench(TEXT, (t) => (t.includes("oops") ? { code: "LOAD", severity: "error", message: "oops did not load" } : null));
  const edited = TEXT.replace("radius: 25", "radius: 5");
  assert.equal((await b.editor.apply(edited)).ok, true);
  assert.equal(b.editor.text, edited);
  assert.equal(b.record().lens[1].radius, 5);
  const bad = await b.editor.apply(edited + "oops");
  assert.deepEqual(bad.diagnostics.map((d) => d.code), ["LOAD"], "the build's own codes");
  assert.equal(b.editor.text, edited);
  await b.editor.undo();
  assert.equal(b.editor.text, TEXT);
});

test("an action's edits are one write-back and one undo step; writes made at once are applied in turn", async () => {
  const b = await bench();
  const r = await b.editor.writeAll("b", [{ to: "arg.b.lens#0:0.radius", value: 1 }, { to: "arg.b.lens#1:0.radius", value: 2 }]);
  assert.equal(r.ok, true);
  assert.match(b.editor.text, /radius: 1,[\s\S]*radius: 2,/);
  await b.editor.undo();
  assert.equal(b.editor.text, TEXT, "one step");
  const both = await Promise.all([
    b.editor.write({ part: "b", to: "arg.b.lens#0:0.radius", value: 3 }),
    b.editor.write({ part: "b", to: "arg.b.lens#1:0.radius", value: 4 }),
  ]);
  assert.deepEqual(both.map((x) => x.ok), [true, true], JSON.stringify(both));
  assert.match(b.editor.text, /radius: 3,[\s\S]*radius: 4,/);
});
