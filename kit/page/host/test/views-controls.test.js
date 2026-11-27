// @ts-nocheck: a stand-in DOM, which TypeScript cannot follow here.
// The generated controls view's forms (views.js's controlForm; review of 787000e, leaves FtbfNP and UYk5XG): a keyed
// Control is known by the form's `keyed` (its composed declaration is plain data, with no `each`), and shows one form
// per instance, each sending its record with the instance's key; a Control with `to` previews while a slider moves and
// commits on its change. Over a stand-in DOM that records elements, since the host's views take a document.
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

/** Every element under a node, depth first. @param {any} n @returns {any[]} */
const all = (n) => [n, ...(n.children ?? []).flatMap(all)];

test("a keyed Control shows one form per instance, each sending its key; it is known by keyed, not by each", () => {
  const sent = [];
  const form = { name: "ratio", kind: "number", min: 0.25, max: 16, value: 1, keyed: true, to: undefined, instances: [{ key: "a", label: "a", value: 2, min: 0.25, max: 16, to: "arg.s.op#1:1.ratio" }, { key: "b", value: 3, min: 0.25, max: 16 }] };
  const el = controlForm(form, (record, phase) => sent.push([record, phase]), () => {});
  assert.ok(el, "a keyed form is shown");
  const sliders = all(el).filter((n) => n.tag === "input");
  assert.equal(sliders.length, 2, "one form per instance");
  sliders[0].oninput({ target: { value: "4" } });
  sliders[0].onchange({ target: { value: "5" } });
  sliders[1].oninput({ target: { value: "6" } });
  assert.deepEqual(sent, [[{ value: 4, key: "a" }, "preview"], [{ value: 5, key: "a" }, undefined], [{ value: 6, key: "b" }, undefined]], "an instance with to previews, then commits on its change; one without sends each change");
  assert.equal(sliders[1].onchange, undefined, "no commit for an instance without to");
  assert.notEqual(controlForm({ name: "volume", kind: "number", min: 0, max: 1, value: 0.5 }, () => {}, () => {}), null, "an unkeyed form is as it was");
});
