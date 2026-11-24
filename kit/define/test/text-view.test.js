// Every Dialect has a text view (job wKd0l8; project/2026-11-24-architecture-synthesis.md §3.3): `text(state)`
// gives its screen and state as characters, sized for a model. A Dialect without one is D020. What `state` is
// belongs to the Dialect: fields takes a rendered frame, the data Dialect a table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, exact, DefinitionError, DEFINE_CODES } from "../index.js";
import { fields } from "../../dialects/fields/index.js";
import { data } from "../../dialects/data/index.js";

/** @param {Record<string, unknown>} extra */
const def = (extra) => /** @type {any} */ ({
  name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } }, ...extra,
});
/** @param {unknown} d */
const codes = (d) => {
  try { defineDialect(/** @type {any} */ (d)); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError);
    return e.diagnostics.map((x) => `${x.code} ${x.path.join(".")}`);
  }
};

test("a Dialect without text(state) is D020, and so is a text that is not a function", () => {
  assert.ok(Object.hasOwn(DEFINE_CODES, "D020"));
  assert.deepEqual(codes(def({})), ["D020 text"]);
  assert.deepEqual(codes(def({ text: "a view" })), ["D020 text"]);
  const d = defineDialect(def({ text: (/** @type {unknown} */ s) => `state: ${s}` }));
  assert.equal(d.text(3), "state: 3");
});

/** A frame of `w` by `h` whose brightness rises left to right; row 0 is the bottom. @param {number} w @param {number} h */
const ramp = (w, h) => ({ width: w, height: h, pixels: Array.from({ length: w * h }, (_, k) => { const v = (k % w) / (w - 1); return [v, v, v]; }) });

test("fields' text view draws a frame as characters, dark to light, top row first", () => {
  const top = { width: 2, height: 2, pixels: [[0, 0, 0], [0, 0, 0], [1, 1, 1], [1, 1, 1]] };
  const lines = fields.text(top).split("\n");
  assert.match(lines[0], /2 × 2/);
  assert.deepEqual(lines.slice(1), ["@@", "  "], "the top row is the last in pixels, and light is @");
  assert.deepEqual(fields.text(ramp(10, 1)).split("\n")[1], " .:-=+*#%@");
});

test("fields' text view samples a large frame down to at most 64 by 32 characters", () => {
  const lines = fields.text(ramp(640, 480)).split("\n");
  assert.match(lines[0], /640 × 480.*64 × 32/);
  assert.equal(lines.length, 33);
  assert.ok(lines.slice(1).every((l) => l.length === 64));
});

test("the data Dialect's text view prints a table: its columns with types, then rows, dates as days", () => {
  const table = {
    name: "top",
    columns: { name: "str", total: "f64", since: "date" },
    rows: [{ name: "Ada", total: 12.5, since: Date.UTC(2026, 0, 2) }, { name: "Grace", total: 3, since: Date.UTC(2025, 11, 31) }],
  };
  assert.equal(data.text(table), [
    "top: 2 rows",
    "name: str | total: f64 | since: date",
    "Ada | 12.5 | 2026-01-02",
    "Grace | 3 | 2025-12-31",
  ].join("\n"));
});

test("the data Dialect's text view shows the first 20 rows and cuts long cells", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ note: "x".repeat(i === 0 ? 50 : 1) }));
  const lines = data.text({ name: "t", columns: { note: "str" }, rows }).split("\n");
  assert.equal(lines[0], "t: 25 rows");
  assert.equal(lines[2], `${"x".repeat(23)}…`);
  assert.equal(lines.length, 2 + 20 + 1);
  assert.equal(lines.at(-1), "… 5 more rows");
});
