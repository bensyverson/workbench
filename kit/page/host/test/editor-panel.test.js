// @ts-nocheck: a stand-in DOM, which TypeScript cannot follow here.
// The editor stage's panel (editor-panel.js) and the draft rebase it uses (editor.js's rebaseDraft), over a stand-in
// DOM (reviewer-79, issue APskkG L4 and L5): a draft held while a write-back lands is rebased onto the written text when
// the two edits do not meet, and otherwise kept and said to be under a changed text, never silently reverted; a write
// or a show from an earlier load's holder never reaches the view a later load built.
import { test } from "node:test";
import assert from "node:assert/strict";

class FakeNode {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...c) { this.children.push(...c); }
  replaceChildren() { this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => Object.assign(new FakeNode("#text"), { text }) };
const { createEditorPanel } = await import("../editor-panel.js");
const { rebaseDraft } = await import("../editor.js");

const all = (n) => [n, ...(n.children ?? []).flatMap(all)];

test("rebaseDraft puts a draft's edit onto a written text when the two do not meet, and refuses when they do", () => {
  const base = "a = 1;\nb = 2;\nc = 3;\n";
  assert.deepEqual(rebaseDraft(base, "a = 9;\nb = 2;\nc = 3;\n", "a = 1;\nb = 2;\nc = 7;\n"), { ok: true, text: "a = 9;\nb = 2;\nc = 7;\n" });
  assert.deepEqual(rebaseDraft(base, "a = 1;\nb = 2;\nc = 3;\n// note\n", "a = 4;\nb = 2;\nc = 3;\n"), { ok: true, text: "a = 4;\nb = 2;\nc = 3;\n// note\n" }, "an edit after the write");
  assert.deepEqual(rebaseDraft(base, "a = 1;\nb = 5;\nc = 3;\n", "a = 1;\nb = 6;\nc = 3;\n"), { ok: false }, "both edit b");
  assert.deepEqual(rebaseDraft(base, "a = 1;\nb = 2;\nc = 3 ;\n", "a = 1;\nb = 2;\nc = 33;\n"), { ok: false }, "edits that touch conflict");
  assert.deepEqual(rebaseDraft(base, base, "x"), { ok: true, text: "x" }, "no draft: the written text");
  assert.deepEqual(rebaseDraft(base, "y", base), { ok: true, text: "y" }, "no write: the draft");
});

/** The panel over a holder whose editor and session are stubs the test replaces. */
function panel() {
  const box = new FakeNode("div");
  const listed = [];
  const p = createEditorPanel({ box: () => box, listed: (source, ds) => listed.push([source, ...ds]), reload: async () => { throw new Error("not built here"); }, mount: async () => {} });
  /** @param {string} source */
  const holder = (source) => ({ loaded: { program: {}, source, sourceName: "x.js" }, session: null, elements: new Map(), editor: null });
  const area = () => all(box).find((n) => n.tag === "textarea");
  const note = () => all(box).find((n) => n.tag === "span" && n.attrs.class === "dim");
  return { p, box, listed, holder, area, note };
}
/** An editor stub at `text` (what a write leaves), recording writes. */
const stubEditor = (text) => ({ text, canUndo: true, canRedo: false, writes: [], write(c) { this.writes.push(c); return Promise.resolve({ ok: true, text: this.text, changed: true }); } });

test("a draft held while a write-back lands is rebased onto the written text", () => {
  const t = panel();
  const c = t.holder("a = 1;\nb = 2;\n");
  t.p.build(c);
  const area = t.area();
  assert.equal(area.value, "a = 1;\nb = 2;\n");
  area.value = "a = 9;\nb = 2;\n";
  area.oninput();
  // a Grip's release wrote b
  c.editor = stubEditor("a = 1;\nb = 5;\n");
  t.p.show(c);
  assert.equal(area.value, "a = 9;\nb = 5;\n", "the draft keeps its edit and gains the write");
  assert.match(t.note().textContent, /edited/);
  assert.doesNotMatch(t.note().textContent, /changed under/);
});

test("a draft whose edit meets the write is kept, and the panel says the text changed under it", () => {
  const t = panel();
  const c = t.holder("a = 1;\nb = 2;\n");
  t.p.build(c);
  const area = t.area();
  area.value = "a = 1;\nb = 7;\n";
  area.oninput();
  c.editor = stubEditor("a = 1;\nb = 5;\n");
  t.p.show(c);
  assert.equal(area.value, "a = 1;\nb = 7;\n", "the draft is not reverted");
  assert.match(t.note().textContent, /changed under/);
  // the person's own Apply, Undo or Redo shows the text
  t.p.show(c, true);
  assert.equal(area.value, "a = 1;\nb = 5;\n");
  assert.doesNotMatch(t.note().textContent, /changed under/);
});

test("a show or a write from an earlier load's holder does not reach the view a later load built", async () => {
  const t = panel();
  const old = t.holder("old = 1;\n");
  t.p.build(old);
  const fresh = t.holder("fresh = 1;\n");
  t.p.build(fresh);
  assert.equal(t.area().value, "fresh = 1;\n");
  const stale = stubEditor("old = 2;\n");
  old.editor = stale;
  t.p.show(old);
  assert.equal(t.area().value, "fresh = 1;\n", "the old holder's text stays out");
  t.p.write(old, { part: "p", to: "arg.x", value: 2 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(stale.writes, [], "an old load's write is dropped");
  assert.equal(t.area().value, "fresh = 1;\n");
});
