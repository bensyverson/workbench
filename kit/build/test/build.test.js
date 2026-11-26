// kit/build: the build record as data (the build record draft, ruled 2026-11-26). A part's content key, the
// revision rule (bump only when the key changes), and the build event a rebuild writes to the run log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256, canonical, partKey, compositionKey, nextRevision, buildEvent, paramTrigger, packageTrigger, glueTrigger, stateHash } from "../index.js";
import { hashText } from "../../package/index.js";
import { KIT_VERSION } from "../../define/index.js";

test("sha256 is synchronous and agrees with kit/package's hashText byte for byte", async () => {
  for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "héllo ✓ 𝄞", "x\n".repeat(1000)]) {
    assert.equal(sha256(s), await hashText(s), JSON.stringify(s.slice(0, 10)));
  }
});

test("canonical sorts object keys at every depth and keeps array order", () => {
  assert.equal(canonical({ b: 1, a: { d: [3, 1], c: null } }), '{"a":{"c":null,"d":[3,1]},"b":1}');
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

test("a part's content key: the kit version, the package's key and the canonical record, never its reads", () => {
  const rec = { name: "level", grid: ["#.#"], reads: [{ param: "depth", value: 2, by: "grid", file: "w.js", loc: { start: { line: 3, column: 0 } } }] };
  const k = partKey({ package: "sha256-P", record: rec });
  assert.match(k, /^sha256-[A-Za-z0-9+/]{43}=$/);
  assert.equal(k, sha256(`${KIT_VERSION}\0sha256-P\0${canonical({ name: "level", grid: ["#.#"] })}`));
  // the reads' places move when the glue's lines do: the key does not
  assert.equal(partKey({ package: "sha256-P", record: { ...rec, reads: [] } }), k);
  assert.notEqual(partKey({ package: "sha256-Q", record: rec }), k);
  assert.notEqual(partKey({ package: "sha256-P", record: { ...rec, grid: ["###"] } }), k);
  assert.notEqual(partKey({ package: "sha256-P", record: rec, kitVersion: "9.9" }), k);
  assert.equal(partKey({ package: null, record: rec }), sha256(`${KIT_VERSION}\0\0${canonical({ name: "level", grid: ["#.#"] })}`));
});

test("a param's value is not in the content key; its declaration is (ruled 2026-11-26, x3iG6D)", () => {
  const rec = (/** @type {Record<string, unknown>} */ decl) => ({ name: "cave", grid: ["#.#"], params: { depth: { value: 0, min: 0, max: 9, ...decl }, seed: { value: 7 } } });
  const k = partKey({ package: null, record: rec({}) });
  // build-time code that made the same record from another value: the same key
  assert.equal(partKey({ package: null, record: rec({ value: 3 }) }), k);
  // the declaration's other fields stay in it, and so does the set of declared params
  assert.notEqual(partKey({ package: null, record: rec({ max: 8 }) }), k);
  assert.notEqual(partKey({ package: null, record: { ...rec({}), params: { depth: { value: 0, min: 0, max: 9 } } } }), k);
  // what the build made from a value is still keyed
  assert.notEqual(partKey({ package: null, record: { ...rec({ value: 3 }), grid: ["###"] } }), k);
});

test("a build event's record fields are compared as the key sees them: a param's new value alone is no field", () => {
  const before = { key: "k1", revision: 1, record: { grid: ["#.#"], params: { depth: { value: 0 } } }, kernels: {} };
  const after = { key: "k2", record: { grid: ["###"], params: { depth: { value: 3 } } }, kernels: {} };
  const e = buildEvent({ part: "cave", boundary: { after: null, before: "0" }, trigger: paramTrigger({}, "depth", 0, 3), before, after, consumers: [] });
  assert.deepEqual(e.record, ["grid"]);
  const declared = buildEvent({ part: "cave", boundary: { after: null, before: "0" }, trigger: glueTrigger(), before, after: { ...after, record: { ...before.record, params: { depth: { value: 0, max: 9 } } } }, consumers: [] });
  assert.deepEqual(declared.record, ["params"]);
});

test("a composition's key is its parts' keys by identity, sorted, and its wires as data", () => {
  const wires = [{ from: "a.out.x", to: "b.in.y" }];
  const k = compositionKey({ b: "k2", a: "k1" }, wires, "b");
  assert.equal(k, compositionKey({ a: "k1", b: "k2" }, wires, "b"));
  assert.notEqual(k, compositionKey({ a: "k1", b: "k3" }, wires, "b"));
  assert.notEqual(k, compositionKey({ a: "k1", b: "k2" }, [], "b"));
});

test("a revision starts at 1 and bumps only when the content key changes", () => {
  assert.equal(nextRevision(null, "k1"), 1);
  assert.equal(nextRevision({ key: "k1", revision: 1 }, "k1"), 1);
  assert.equal(nextRevision({ key: "k1", revision: 1 }, "k2"), 2);
  assert.equal(nextRevision({ key: "k2", revision: 2 }, "k2"), 2);
});

test("triggers: a param read at build time, a package whose key changed, a glue edit", () => {
  const record = { reads: [{ param: "depth", value: 2, by: "grid", file: "w.js", loc: { start: { line: 14, column: 2 } } }, { param: "other", value: 1, by: null, file: "w.js", loc: { start: { line: 2, column: 0 } } }] };
  assert.deepEqual(paramTrigger(record, "depth", 2, 3), { kind: "param", param: "depth", from: 2, to: 3, reads: [{ file: "w.js", line: 14, by: "grid" }] });
  assert.deepEqual(paramTrigger({}, "depth", 2, 3).reads, []);
  assert.deepEqual(packageTrigger({ key: "sha256-A", files: { "a.js": "h1", "b.js": "h2" } }, { key: "sha256-B", files: { "a.js": "h1", "b.js": "h3", "c.js": "h4" } }), { kind: "package", from: "sha256-A", to: "sha256-B", files: ["b.js", "c.js"] });
  assert.deepEqual(packageTrigger({ key: "sha256-A" }, { key: "sha256-B" }).files, []);
  assert.deepEqual(glueTrigger("level.grid"), { kind: "glue", call: "level.grid" });
});

test("a build event: the key before and after, the revision, what changed in the record and which Kernels", () => {
  const before = { key: "k1", revision: 2, record: { name: "level", grid: ["#.#"], tick: 0.125 }, kernels: { "level.control": "src1", "level.spawn": "s" } };
  const after = { key: "k2", record: { name: "level", grid: ["###"], tick: 0.125, start: { x: 1 } }, kernels: { "level.control": "src1", "level.next": "n" } };
  const e = buildEvent({ part: "level", boundary: { after: "12", before: "101/8" }, trigger: glueTrigger("level.grid"), before, after, consumers: ["fx.in.burst"] });
  assert.deepEqual(e, {
    kind: "build", part: "level", boundary: { after: "12", before: "101/8" }, trigger: { kind: "glue", call: "level.grid" },
    ok: true, changed: true, key: { before: "k1", after: "k2" }, revision: { before: 2, after: 3 },
    record: ["grid", "start"], kernels: { changed: [], added: ["level.next"], removed: ["level.spawn"], unchanged: ["level.control"] },
    consumers: ["fx.in.burst"], diagnostics: [],
  });
  const same = buildEvent({ part: "level", boundary: { after: "12", before: "101/8" }, trigger: paramTrigger({}, "speed", 1, 2), before, after: { ...before, key: "k1" }, consumers: [] });
  assert.equal(same.changed, false);
  assert.deepEqual(same.revision, { before: 2, after: 2 });
  assert.deepEqual(same.record, []);
  const failed = buildEvent({ part: "level", boundary: { after: null, before: "0" }, trigger: glueTrigger(), before, after: null, consumers: [], diagnostics: [{ code: "B003", message: "m" }] });
  assert.equal(failed.ok, false);
  assert.equal(failed.changed, false);
  assert.deepEqual(failed.key, { before: "k1", after: null });
  assert.deepEqual(failed.revision, { before: 2, after: 2 });
  assert.deepEqual(failed.diagnostics, [{ code: "B003", message: "m" }]);
});

test("stateHash is a fast, key-order-blind hash of plain data", () => {
  assert.equal(stateHash({ a: 1, b: [1, 2] }), stateHash({ b: [1, 2], a: 1 }));
  assert.notEqual(stateHash({ a: 1 }), stateHash({ a: 2 }));
  assert.match(stateHash({ a: 1 }), /^[0-9a-f]{14}$/);
});

test("canonical tells Infinity, -Infinity, NaN and null apart, and -0 from 0, so content keys do too", () => {
  const forms = [Infinity, -Infinity, NaN, null, 0, -0].map((v) => canonical({ v }));
  assert.equal(new Set(forms).size, 6, forms.join(" "));
  // a field the build made: a param's own value is not keyed (x3iG6D)
  const rec = (/** @type {unknown} */ v) => ({ level: { depth: v } });
  const keys = [Infinity, NaN, null, 0, -0].map((v) => partKey({ package: null, record: rec(v) }));
  assert.equal(new Set(keys).size, 5);
  // plain JSON data keeps its JSON text, so ordinary keys do not move
  assert.equal(canonical({ b: [1, "x", true, null], a: 2.5 }), '{"a":2.5,"b":[1,"x",true,null]}');
  assert.equal(canonical([undefined, () => 0]), "[null,null]");
  assert.equal(canonical({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonical(undefined), undefined);
});
