// The IR's diffable JSON form: valid JSON, with small nodes kept on one line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatJSON } from "../index.js";

test("formats round-trip and keep short values on one line", () => {
  const v = { k: "op", op: "sub", args: [{ k: "local", name: "t0", t: "f64", span: [3, 5] }, { k: "num", v: 1, t: "f64", span: [6, 7] }], t: "f64", span: [3, 7] };
  const text = formatJSON(v, 64);
  assert.deepEqual(JSON.parse(text), v);
  assert.match(text, /^ {4}\{ "k": "local", "name": "t0", "t": "f64", "span": \[3, 5\] \},$/m);
  assert.match(text, /^ {2}"span": \[3, 7\]$/m);
  assert.ok(text.endsWith("}\n"));
});

test("empty containers and nested short arrays stay compact", () => {
  assert.equal(formatJSON({ a: [], b: {} }), "{ \"a\": [], \"b\": {} }\n");
});
