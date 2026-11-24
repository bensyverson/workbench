// Regression tests from the second review: a Program's helpers and constants never replace the
// Library's, and an f32 loop over a uniform lowers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField, field } from "../index.js";
import { LIBRARY } from "../library.js";
import { lowerProgram } from "../../../lower/index.js";
import { fieldsEnvironment } from "../environment.js";

test("a helper named like a Library function is refused, naming both", () => {
  assert.throws(() => field("c").fn("vnoise", "(p, s) => 0.25"), /'vnoise'.*Library|Library.*'vnoise'/);
  assert.throws(() => field("c").fn("pmod", "(x, n) => x"), /Library/);
});

test("a constant named like a Library constant is refused, naming both", () => {
  assert.throws(() => field("c").const("OCTAVE_COS", "2"), /'OCTAVE_COS'.*Library|Library.*'OCTAVE_COS'/);
});

test("a hand-built Program whose helper collides with the Library is refused when lowered", () => {
  const program = { name: "c", params: {}, pixel: "(uv, u) => { const f = fbm(uv, 1); return color(f, f, f); }", units: [{ name: "vnoise", kind: /** @type {const} */ ("fn"), src: "(p, s) => 0.25" }] };
  assert.throws(() => lowerField(program), /'vnoise'.*Library|Library.*'vnoise'/);
});

test("a Program's two units of one name are refused by lowering", () => {
  const units = [{ name: "a", kind: /** @type {const} */ ("const"), src: "1" }, { name: "a", kind: /** @type {const} */ ("const"), src: "2" }];
  assert.throws(() => lowerProgram(fieldsEnvironment({}), [], units), /'a'.*twice|twice.*'a'/);
});

test("every Library name is still lowered once, with no collision among them", () => {
  assert.equal(new Set(LIBRARY.map((u) => u.name)).size, LIBRARY.length);
  const r = lowerField(field("c").pixel("(uv, u) => { const f = fbm(uv, 1); return color(f, f, f); }").build());
  assert.deepEqual(r.diagnostics, []);
});

test("a loop over a uniform lowers, and a constant bound past 2^24 does not", () => {
  const ok = (/** @type {string} */ src) => lowerField(field("c").param("n", { value: 4, min: 0, max: 100 }).pixel(`(uv, u) => { let s = 0; ${src} return color(s, s, s); }`).build()).diagnostics.map((d) => d.code);
  assert.deepEqual(ok("for (let i = 0; i < u.n; i++) { s += 1; }"), []);
  assert.deepEqual(ok("for (let i = 0; i < 20000000; i++) { s += 1; }"), ["L007"]);
});
