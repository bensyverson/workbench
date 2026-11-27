// @ts-nocheck: a stand-in DOM, which TypeScript cannot follow here.
// The vector, points and pick widgets, and scoped and keyed forms of every kind (views.js's controlForm, widgets.js,
// pick-data.js), over a stand-in DOM that records elements.
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
const { controlForm } = await import("../views.js");
const { parseCsv, pickTable, pickRecord, dataFileOf } = await import("../pick-data.js");

const all = (n) => [n, ...(n.children ?? []).flatMap(all)];
const text = (n) => all(n).filter((x) => x.tag === "#text").map((x) => x.text).join("|");
const nop = () => {};

test("a vector edits each component within its bounds and sends the whole vector", () => {
  const sent = [];
  const el = controlForm({ name: "dir", kind: "vector", dims: 3, min: -1, max: 1, value: [0, 0.5, 1] }, (r) => sent.push(r), nop);
  const numbers = all(el).filter((n) => n.tag === "input" && n.attrs.type === "number");
  assert.equal(numbers.length, 3, "one per component");
  numbers[1].oninput({ target: { value: "0.25" } });
  numbers[2].oninput({ target: { value: "9" } });
  numbers[0].oninput({ target: { value: "" } });
  assert.deepEqual(sent, [{ value: [0, 0.25, 1] }, { value: [0, 0.25, 1] }], "an edit past the bound is clamped; an empty box sends nothing");
  assert.equal(numbers[2].value, "1");
  assert.equal(controlForm({ name: "p", kind: "vector", dims: 2, min: 0, max: 1, value: [0, 0] }, nop, nop).children.length > 0, true);
});

test("a point list adds, moves and removes points, within its ranges and max", () => {
  const sent = [];
  const form = { name: "env", kind: "points", max: 3, x: [0, 10], y: [0, 1], value: [[0, 0], [5, 1]] };
  const el = controlForm(form, (r) => sent.push(r), nop);
  const box = all(el).find((n) => n.attrs.class === "points");
  const add = all(el).find((n) => n.tag === "button" && n.children[0]?.text === "Add point");
  const nums = () => all(box).filter((n) => n.tag === "input" && n.attrs.type === "number");
  assert.equal(nums().length, 4);
  nums()[2].oninput({ target: { value: "50" } });
  assert.deepEqual(sent.at(-1), { value: [[0, 0], [10, 1]] }, "a move is clamped to x");
  add.onclick();
  assert.deepEqual(sent.at(-1), { value: [[0, 0], [10, 1], [5, 0.5]] }, "an added point lands mid-range");
  assert.equal(add.disabled, true, "at max");
  add.onclick();
  assert.equal(sent.length, 2, "no point past max");
  const remove = all(box).filter((n) => n.tag === "button");
  remove[0].onclick();
  assert.deepEqual(sent.at(-1), { value: [[10, 1], [5, 0.5]] });
  nums()[3].oninput({ target: { value: "0.25" } });
  assert.deepEqual(sent.at(-1), { value: [[10, 1], [5, 0.25]] }, "a move of y sends the list");
  assert.equal(add.disabled, false);
  assert.equal(nums().length, 4, "the rows are drawn again");
});

const CSV = 'name,nd,Vd,note\n"Crown, K5",1.522,59.5,"a ""crown"""\nFlint,1.62,36.4,\n';
test("parseCsv reads quotes; pickTable and pickRecord make a pick's rows and its record", () => {
  assert.deepEqual(parseCsv(CSV)[1], ["Crown, K5", "1.522", "59.5", 'a "crown"']);
  const t = pickTable({ kind: "csv", text: CSV }, { key: "name" });
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].nd, "1.522", "a cell stays text");
  assert.deepEqual(pickRecord(t.rows[0], { key: "name", carry: { nd: "f64", note: "str" } }), { value: "Crown, K5", nd: 1.522, note: 'a "crown"' });
  assert.match(pickTable({ kind: "csv", text: CSV }, { key: "glass" }).error, /no column 'glass'/);
  assert.match(pickTable(null, { key: "x" }).error, /not available/);
  assert.match(pickTable({ kind: "text", text: "" }, { key: "x" }).error, /not a csv/);
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]], "CRLF line ends");
  const ids = pickTable({ kind: "csv", text: "id,w\n007,1.50\n" }, { key: "id" });
  assert.deepEqual(pickRecord(ids.rows[0], { key: "id", carry: { w: "f64" } }), { value: "007", w: 1.5 }, "a key like 007 is kept, a carried f64 is a number");
  assert.deepEqual(pickRecord({ id: 7, tag: 3 }, { key: "id", carry: { tag: "str" } }), { value: "7", tag: "3" }, "a json row's number key is text, a carried str is text");
  assert.equal(pickTable({ kind: "json", value: [{ id: "a" }, { id: "b" }] }, { key: "id" }).rows.length, 2);
});

test("a pick lists the data file's rows, filters them, and sends the chosen row with its carried columns", () => {
  const sent = [];
  const form = { name: "glass", kind: "pick", file: "glasses", key: "name", show: ["nd"], carry: { nd: "f64" }, value: "Flint" };
  const el = controlForm(form, (r) => sent.push(r), nop, () => ({ kind: "csv", text: CSV }));
  const select = all(el).find((n) => n.tag === "select");
  const options = () => select.children.filter((n) => n.tag === "option");
  assert.equal(options().length, 2);
  assert.equal(options()[1].attrs.selected, "", "the declared value is selected");
  assert.match(text(options()[0]), /Crown, K5\s+1\.522/);
  all(el).find((n) => n.attrs.type === "search").oninput({ target: { value: "flin" } });
  assert.equal(options().length, 1);
  all(el).find((n) => n.attrs.type === "search").oninput({ target: { value: "FLIN" } });
  assert.equal(options().length, 1, "the filter ignores case");
  select.onchange({ target: { selectedIndex: 0 } });
  assert.deepEqual(sent, [{ value: "Flint", nd: 1.62 }]);
  assert.match(text(controlForm(form, nop, nop)), /not available/, "a file the page cannot read is said");
});

test("dataFileOf finds the file through the part's Dialect, else any package's", () => {
  const pkg = (name, path, data) => ({ name, loaded: { dialect: { def: { files: { glasses: { path } } } }, data } });
  const loaded = { composed: { parts: [{ name: "lens", dialect: "optics" }] }, packages: [pkg("other", "o.csv", { "o.csv": { kind: "csv", text: "other" } }), pkg("optics", "g.csv", { "g.csv": { kind: "csv", text: "optics" } })] };
  assert.equal(dataFileOf(loaded)({ file: "glasses", part: "lens" }).text, "optics");
  assert.equal(dataFileOf(loaded)({ file: "glasses" }).text, "other");
  assert.equal(dataFileOf(loaded)({ file: "nope" }), null);
});

const KINDS = {
  buttons: { buttons: ["a", "b"] }, toggle: { value: true }, number: { min: 0, max: 1, value: 0.5 }, vector: { dims: 2, min: 0, max: 1, value: [0, 1] }, color: { value: [1, 0, 0] },
  choice: { options: ["x", "y"], value: "x" }, text: { value: "" }, points: { max: 2, x: [0, 1], y: [0, 1], value: [[0, 0]] }, triggers: { count: 2 },
  pick: { file: "f", key: "name", value: "Flint" },
};
test("every kind shows one form per instance when keyed, scoped or not,", () => {
  for (const [kind, decl] of Object.entries(KINDS)) {
    for (const part of [undefined, "synth"]) {
      const sent = [];
      const name = part ? `${part}.c` : "c";
      const form = { name, kind, ...decl, keyed: true, ...(part ? { part } : {}), instances: [{ key: "a" }, { key: "b", label: "Bee" }] };
      const el = controlForm(form, (r) => sent.push(r), nop, () => ({ kind: "csv", text: CSV }));
      assert.ok(el, kind);
      const inner = el.children.filter((n) => n.attrs?.class?.startsWith("control"));
      assert.equal(inner.length, 2, `${kind}: one form per instance`);
      assert.match(text(el), /Bee/);
      if (part) assert.equal(all(el).filter((n) => n.tag === "span" && n.children[0]?.text === part).length, 1, `${kind}: the part is shown once`);
    }
  }
});

test("a scoped Control is tagged with its part and shown by its own name", () => {
  const el = controlForm({ name: "synth.cutoff", part: "synth", kind: "number", min: 0, max: 1, value: 0 }, nop, nop);
  assert.equal(text(el), "synth|cutoff");
});
