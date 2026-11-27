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
  assert.deepEqual(pickRecord(t.rows[0], { key: "name", carry: { nd: "f64", note: "str" } }).record, { value: "Crown, K5", nd: 1.522, note: 'a "crown"' });
  assert.match(pickTable({ kind: "csv", text: CSV }, { key: "glass" }).error, /no column 'glass'/);
  assert.match(pickTable(null, { key: "x" }).error, /not available/);
  assert.match(pickTable({ kind: "text", text: "" }, { key: "x" }).error, /not a csv/);
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]], "CRLF line ends");
  const ids = pickTable({ kind: "csv", text: "id,w\n007,1.50\n" }, { key: "id" });
  assert.deepEqual(pickRecord(ids.rows[0], { key: "id", carry: { w: "f64" } }).record, { value: "007", w: 1.5 }, "a key like 007 is kept, a carried f64 is a number");
  assert.deepEqual(pickRecord({ id: 7, tag: 3 }, { key: "id", carry: { tag: "str" } }).record, { value: "7", tag: "3" }, "a json row's number key is text, a carried str is text");
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

// issue ko3E1R (reviewer-79): every kind with to previews on input and commits on its change or release, as number does
test("every kind with to previews while it moves and commits on its change or release", () => {
  const to = { to: "arg.b.x#0:0", part: "b", disabled: null };
  /** @param {any} form */
  const rig = (form) => { const sent = []; const el = controlForm({ ...form, ...to }, (r, phase) => sent.push([r, phase ?? "commit"]), nop, () => ({ kind: "csv", text: CSV })); return { el, sent }; };
  const phases = (sent) => sent.map(([, p]) => p);

  const v = rig({ name: "b.at", kind: "vector", dims: 2, min: 0, max: 100, value: [30, 40] });
  const vr = all(v.el).filter((n) => n.tag === "input" && n.attrs.type === "range");
  for (const x of ["31", "32", "33"]) vr[0].oninput({ target: { value: x } });
  vr[0].onchange({ target: { value: "33" } });
  assert.deepEqual(phases(v.sent), ["preview", "preview", "preview", "commit"], "vector");
  assert.deepEqual(v.sent.at(-1)[0], { value: [33, 40] });
  const vn = all(v.el).filter((n) => n.tag === "input" && n.attrs.type === "number");
  vn[1].onchange({ target: { value: "41" } });
  assert.deepEqual(v.sent.at(-1), [{ value: [33, 41] }, "commit"], "a typed number commits on its change");

  const p = rig({ name: "b.env", kind: "points", max: 3, x: [0, 10], y: [0, 1], value: [[0, 0], [5, 1]] });
  const pn = () => all(p.el).filter((n) => n.tag === "input" && n.attrs.type === "number");
  pn()[0].oninput({ target: { value: "1" } });
  pn()[0].oninput({ target: { value: "2" } });
  pn()[0].onchange({ target: { value: "2" } });
  all(p.el).find((n) => n.tag === "button" && n.children[0]?.text === "Add point").onclick();
  assert.deepEqual(phases(p.sent), ["preview", "preview", "commit", "commit"], "points: a move previews, its change and an add commit");
  assert.deepEqual(p.sent.at(-1)[0], { value: [[2, 0], [5, 1], [5, 0.5]] });

  const c = rig({ name: "b.tint", kind: "color", value: [1, 0, 0] });
  const well = all(c.el).find((n) => n.tag === "input");
  well.oninput({ target: { value: "#00ff00" } });
  well.onchange({ target: { value: "#0000ff" } });
  assert.deepEqual(c.sent, [[{ value: [0, 1, 0] }, "preview"], [{ value: [0, 0, 1] }, "commit"]], "color");

  const t = rig({ name: "b.title", kind: "text", value: "" });
  const box = all(t.el).find((n) => n.tag === "input");
  box.oninput({ target: { value: "a" } });
  box.oninput({ target: { value: "ab" } });
  box.onchange({ target: { value: "ab" } });
  assert.deepEqual(t.sent, [[{ value: "a" }, "preview"], [{ value: "ab" }, "preview"], [{ value: "ab" }, "commit"]], "text");

  const o = rig({ name: "b.mode", kind: "choice", options: ["x", "y"], value: "x" });
  all(o.el).find((n) => n.tag === "select").onchange({ target: { value: "y" } });
  const g = rig({ name: "b.on", kind: "toggle", value: false });
  all(g.el).find((n) => n.tag === "input").onchange({ target: { checked: true } });
  assert.deepEqual([...o.sent, ...g.sent], [[{ value: "y" }, "commit"], [{ value: true }, "commit"]], "a discrete change is its own commit");

  // without to, a move sends each change as it is (no phase), as before
  const sent = [];
  const plain = controlForm({ name: "dir", kind: "vector", dims: 2, min: 0, max: 1, value: [0, 0] }, (r, phase) => sent.push(phase), nop);
  all(plain).filter((n) => n.tag === "input" && n.attrs.type === "range")[0].oninput({ target: { value: "0.5" } });
  assert.deepEqual(sent, [undefined]);
});

test("a disabled (H011) form of every kind with to is drawn disabled, with its message", () => {
  for (const [kind, decl] of Object.entries(KINDS)) {
    const form = { name: "b.c", kind, ...decl, keyed: false, part: "b", to: "arg.b.x#0:0", disabled: { code: "H011", message: "the argument is `6 * 2`, not a literal" } };
    const el = controlForm(form, () => assert.fail(`${kind} sent`), nop, () => ({ kind: "csv", text: CSV }));
    const inputs = all(el).filter((n) => ["input", "select", "button", "textarea"].includes(n.tag));
    assert.ok(inputs.length > 0, kind);
    assert.ok(inputs.every((n) => n.disabled === true), `${kind}: every input disabled`);
    assert.ok(inputs.every((n) => /H011/.test(n.attrs.title ?? "")), `${kind}: each says why`);
    assert.match(text(el), /H011 the argument is `6 \* 2`, not a literal/, `${kind}: the message is shown`);
  }
  const live = controlForm({ name: "b.c", kind: "vector", dims: 2, min: 0, max: 1, value: [0, 0], to: "arg.b.x#0:0", disabled: null }, nop, nop);
  assert.ok(all(live).filter((n) => n.tag === "input").every((n) => !n.disabled), "an enabled one is not");
});

// issue APskkG L2 (reviewer-79): a carried f64 cell that is empty or not a number is refused, never sent as 0 or NaN
test("pickRecord refuses an empty or non-numeric f64 cell; a JSON table needs its key column in every row", () => {
  const t = pickTable({ kind: "csv", text: "name,nd\nBK7,\nF2,1.62\nX,n/a\n" }, { key: "name" });
  const form = { key: "name", carry: { nd: "f64" } };
  assert.match(pickRecord(t.rows[0], form).error, /BK7.*nd.*empty/);
  assert.match(pickRecord(t.rows[2], form).error, /X.*nd.*"n\/a".*not a number/);
  assert.deepEqual(pickRecord(t.rows[1], form), { record: { value: "F2", nd: 1.62 } }, "a number is carried");
  assert.deepEqual(pickRecord({ name: "J", nd: 1.5 }, form), { record: { value: "J", nd: 1.5 } }, "a json number too");
  assert.match(pickTable({ kind: "json", value: [{ id: "a" }, { name: "b" }] }, { key: "id" }).error, /row 1 has no 'id'/);
  assert.equal(pickTable({ kind: "json", value: [{ id: "a" }, { id: "b" }] }, { key: "id" }).rows.length, 2);
  // the widget says the refusal on the form and sends nothing
  const sent = [];
  const el = controlForm({ name: "glass", kind: "pick", file: "g", key: "name", carry: { nd: "f64" }, value: "F2" }, (r) => sent.push(r), nop, () => ({ kind: "csv", text: "name,nd\nBK7,\nF2,1.62\n" }));
  all(el).find((n) => n.tag === "select").onchange({ target: { selectedIndex: 0 } });
  assert.deepEqual(sent, []);
  assert.match(text(el), /BK7.*empty/);
  all(el).find((n) => n.tag === "select").onchange({ target: { selectedIndex: 1 } });
  assert.deepEqual(sent, [{ value: "F2", nd: 1.62 }]);
});
