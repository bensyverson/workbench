// A Dialect's `state` is the RUN's state: the value text(state) and the UI's views are handed (not a Grammar
// construct's build-time state). It is declared in the Dialect's own type vocabulary and checked at run time
// (leaf quSvgB; project/2026-11-25-defineui-build-plan.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, exact, enumOf, opt, struct, list, vector, scalar, DefinitionError, DEFINE_CODES } from "../index.js";
import { RESERVED_LETTERS } from "../codes.js";

/** @param {Record<string, unknown>} extra */
const def = (extra) => /** @type {any} */ ({
  name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } }, text: (/** @type {unknown} */ s) => JSON.stringify(s), ...extra,
});
/** @param {unknown} d */
const diagnostics = (d) => {
  try { defineDialect(/** @type {any} */ (d)); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError);
    return e.diagnostics;
  }
};
const STATE = {
  score: "f64", alive: "bool", name: "str", pos: "vec2", when: "date", mode: enumOf(["run", "stop"]), best: opt("f64"),
  player: struct({ x: "f64", y: "f64" }), bodies: list(struct({ mass: "f64" }), 8),
};
const types = { vec2: vector(2, "f64"), date: scalar("f64") };
const GOOD = { score: 1, alive: true, name: "a", pos: [1, 2], when: 5, mode: "run", best: null, player: { x: 1, y: 2 }, bodies: [{ mass: 1 }] };
/** The declared state check, which a Dialect with state has. @param {import("../define.js").Dialect} d @param {unknown} v */
const check = (d, v) => /** @type {NonNullable<typeof d.checkState>} */ (d.checkState)(v);

test("a Dialect with state declares it and resolves it to a core Type", () => {
  assert.ok(Object.hasOwn(DEFINE_CODES, "D023"));
  const d = defineDialect(def({ types, state: STATE }));
  assert.deepEqual(d.state, STATE);
  const st = /** @type {any} */ (d.stateType);
  assert.equal(st.struct.score, "f64");
  assert.deepEqual(st.struct.pos, { vec: 2, of: "f64", name: "vec2" });
  assert.deepEqual(st.struct.bodies, { list: { struct: { mass: "f64" } }, max: 8 });
  assert.deepEqual(st.struct.best, { opt: "f64" });
  assert.deepEqual(check(d, GOOD), []);
});

test("without state nothing changes: no state, no stateType, no checkState, text is untouched", () => {
  const d = defineDialect(def({}));
  assert.equal(d.state, undefined);
  assert.equal(d.stateType, undefined);
  assert.equal(d.checkState, undefined);
  assert.equal(d.text(3), "3");
});

test("checkState lists every mismatch by path", () => {
  const d = defineDialect(def({ types, state: STATE }));
  const bad = { ...GOOD, score: "x", pos: [1], mode: "fly", player: { x: 1 }, bodies: [{ mass: 1 }, { mass: true }] };
  const out = check(d, bad);
  assert.deepEqual(out.map((m) => m.path), ["score", "pos", "mode", "player.y", "bodies[1].mass"]);
  assert.ok(out.every((m) => typeof m.message === "string" && m.message.length > 0));
  assert.match(out[0].message, /f64/);
  assert.deepEqual(check(d, null).map((m) => m.path), [""]);
  assert.deepEqual(check(d, { ...GOOD, extra: 1 }).map((m) => m.path), ["extra"], "a member the state does not declare");
  assert.deepEqual(check(d, { ...GOOD, bodies: Array.from({ length: 9 }, () => ({ mass: 1 })) }).map((m) => m.path), ["bodies"], "past the list's max");
  const { score: _s, ...missing } = GOOD;
  assert.deepEqual(check(d, missing).map((m) => m.path), ["score"]);
  assert.deepEqual(check(d, { ...GOOD, score: NaN }).map((m) => m.path), ["score"], "NaN is not a number the run can hold");
});

test("text(state) checks its argument first and throws an error naming the paths", () => {
  const d = defineDialect(def({ types, state: STATE, text: (/** @type {any} */ s) => `score ${s.score}` }));
  assert.equal(d.text(GOOD), "score 1");
  assert.throws(() => d.text({ ...GOOD, score: "x", alive: 3 }), (e) => e instanceof Error && /score/.test(e.message) && /alive/.test(e.message) && /tiny/.test(e.message));
});

test("every malformed state is D023 with a fix, beside the other problems in one DefinitionError", () => {
  /** @type {Array<[unknown, string]>} */
  const cases = [
    [{}, "state"],
    [[], "state"],
    ["f64", "state"],
    [{ a: 3 }, "state.a"],
    [{ a: "nope" }, "state.a"],
    [{ a: { b: "f64" } }, "state.a"],
    [{ a: list("f64", 0) }, "state.a"],
    [{ a: list("f64", 1.5) }, "state.a"], // list("f64") with no max is allowed in state now (leaf aNdksS)
    [{ a: struct({}) }, "state.a"],
    [{ a: struct({ b: { c: "f64" } }) }, "state.a.b"],
    [{ a: "Thing" }, "state.a"],
    [{ a: list(vector(2, "f64"), 3) }, "state.a"],
  ];
  for (const [state, path] of cases) {
    const ds = diagnostics(def({ types, objects: { Thing: { members: {} } }, state }));
    const s = ds.filter((d) => d.code === "D023");
    assert.ok(s.length >= 1, `${JSON.stringify(state)} is D023`);
    assert.ok(s.some((d) => d.path.join(".") === path), `${JSON.stringify(state)} reports at ${path}, got ${s.map((d) => d.path.join("."))}`);
    assert.ok(s.every((d) => d.tip.length > 0));
    assert.ok(ds.every((d) => d.code === "D023"), `${JSON.stringify(state)} gives only D023, got ${ds.map((d) => d.code)}`);
  }
  const both = diagnostics(def({ state: { a: { b: "f64" } }, text: undefined }));
  assert.deepEqual(both.map((d) => d.code).sort(), ["D020", "D023"]);
});

test("a nested plain object is refused with a tip to write struct", () => {
  const [d] = diagnostics(def({ state: { player: { x: "f64" } } }));
  assert.equal(d.code, "D023");
  assert.match(d.tip, /struct\(\{/);
  assert.match(d.message, /state\.player|player/);
});

test("U is reserved for the UI's codes: a check's ctx.error with a U code throws", () => {
  assert.ok(RESERVED_LETTERS.includes("U"));
});

test("N is reserved for kit/run's run-time codes: a Dialect's own code may not start with it", () => {
  assert.ok(RESERVED_LETTERS.includes("N"));
});
