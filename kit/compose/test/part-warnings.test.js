// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A part's own warnings (its Grammar's B codes, its lowering's L codes) reach the composition's diagnostics as
// warnings (review M1: compose kept only a part's errors, so a preset's and a glue part's warnings were never shown).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose } from "../index.js";
import { data, lambda, oneOf } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const W = tiny("w", { state: { t: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { y: { kind: "decl", args: [data(oneOf("string", lambda("k")))] } } }, {
  clock: () => ({ tick: 1 / 4 }), init: () => ({ t: 0 }), step: (s, ctx) => ({ t: s.t + ctx.dt }),
});

test("a part that builds with a warning: the composition carries it as a warning, naming the part, and still builds", () => {
  const box = W.grammar("box").size(1).y("() => 1 +"); // arrow-looking text, kept as text: B007, a warning
  const c = compose("c").part(box).show(box);
  const ds = c.check({ runtimes: [W.runtime] });
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["B007", "warning"]]);
  assert.match(ds[0].message, /^part 'box' \(w\): /);
  assert.equal(c.build({ runtimes: [W.runtime] }).parts[0].name, "box");
});

test("a part with no warnings adds none, and a part's error is still an error", () => {
  const clean = W.grammar("box").size(1).y("plain text");
  assert.deepEqual(compose("c").part(clean).show(clean).check({ runtimes: [W.runtime] }), []);
  const bad = W.grammar("box").size("big");
  const ds = compose("c").part(bad).show(bad).check({ runtimes: [W.runtime] });
  assert.ok(ds.some((d) => d.severity === "error" && d.code.startsWith("B")));
});
