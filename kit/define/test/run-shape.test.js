// The export's shape (Ben, 2026-11-25; trial 4's hidden rejects r22p and r22q). A Program file builds one
// Program: code that opens the root a second time in one run is B016, at the second opening, even when it
// returns the first or the second. Code that opened the root and returns anything but that builder chain is
// B017, the Program author's mistake (coordinator, 2026-11-25). The host's TypeError stays for a function that
// opened no root at all (the define-trial checker reports it as C001).
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, BUILD_CODES } from "../index.js";
import { program } from "../../dialects/data/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };
const one = (/** @type {string} */ n) => program(n).source("sales", SALES).table("t", "sales");
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

test("B016 is a build code", () => {
  assert.ok(Object.hasOwn(BUILD_CODES, "B016"));
});

test("one opening of the root builds, as before", () => {
  const r = run(() => one("q"));
  assert.deepEqual(codes(r.diagnostics), []);
  assert.ok(r.record);
});

for (const [what, fn] of [
  ["returning the second", () => { one("spare"); return one("q"); }],
  ["returning the first", () => { const a = one("q"); one("spare"); return a; }],
]) {
  test(`B016: the root opened twice in one run, ${what}`, () => {
    const r = run(fn);
    assert.equal(r.record, null);
    assert.deepEqual(codes(r.diagnostics), ["B016"]);
    const d = r.diagnostics[0];
    assert.match(d.message, /'spare'|'q'/);
    assert.match(d.message, /twice|second|more than once/);
    assert.match(d.file, /run-shape\.test\.js$/);
    assert.ok(d.tip.length > 0);
  });
}

test("B017 is a build code", () => {
  assert.ok(Object.hasOwn(BUILD_CODES, "B017"));
});

for (const [what, fn] of [
  ["an object holding the builder", () => ({ program: one("q") })],
  ["a number", () => { one("q"); return 3; }],
  ["nothing", () => { one("q"); }],
  ["what .build() returns", () => one("q").build()],
]) {
  test(`B017: the root opened, and the export returns ${what}`, () => {
    const r = run(fn);
    assert.equal(r.record, null);
    assert.deepEqual(codes(r.diagnostics), ["B017"]);
    const d = r.diagnostics[0];
    assert.match(d.message, /program 'q'/);
    assert.match(d.message, /return/);
    assert.match(d.file, /run-shape\.test\.js$/);
    assert.ok(d.tip.length > 0);
  });
}

test("a function that opens no root and returns no builder is still the host's TypeError", () => {
  assert.throws(() => run(() => ({ program: 1 })), /must return the Program's builder chain/);
  assert.throws(() => run(() => 3), TypeError);
});

// Review of 2eae282: B017 names what came back without printing a function's whole source, and names a Promise.
test("B017 for a returned function says 'a function', not its source", () => {
  const r = run(() => { one("q"); return () => 12345; });
  assert.deepEqual(codes(r.diagnostics), ["B017"]);
  assert.match(r.diagnostics[0].message, /returns a function,/);
  assert.doesNotMatch(r.diagnostics[0].message, /12345/);
});

test("B017 for an async export names the Promise", () => {
  const r = run(/** @type {any} */ (async () => one("q")));
  assert.deepEqual(codes(r.diagnostics), ["B017"]);
  assert.match(r.diagnostics[0].message, /a Promise/);
  assert.match(r.diagnostics[0].tip, /async/);
});
