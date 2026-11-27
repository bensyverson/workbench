// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// Part-qualified Controls (Ben's ruling of 2026-11-27, leaf ZNpW0f; project/2026-11-27-controls-draft.md, "In a
// composition"): a keyed Control (`each`) and a Control with `to` belong to the part whose UI declares them, so two
// instances of one package each keep theirs. The page names such a Control `<part>.<control>`; a glue's
// `page.out.<control>` into a part resolves to that part's own, so a glue that plays one instance plays two with
// nothing extra. S119 refuses only what still conflicts: two shared declarations of one name that differ. The
// workbench: two FM synths from one package (a lead and a bass), each with keyed operator knobs and a gain knob that
// writes back, and a logger that is no synth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, page } from "../index.js";
import { defineUI, list } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const RATIO = "Event<{ key: str, value: f64 }>";
/** The synth package: a keyed `ratio` (one knob per operator), a `gain` that writes back, a shared `hold`. */
function synth(controls) {
  const t = tiny("synth", {
    state: { got: list("f64", 100) }, inputs: false,
    ports: { in: { ratio: { seam: RATIO }, gain: { seam: "Event<{ value: f64 }>" }, hold: { seam: "Event<{ value: bool }>" } } },
  }, { clock: () => ({ frame: true }), init: () => ({ got: [] }), events: { in: { ratio: 8, gain: 4, hold: 4 } }, step: (s) => s });
  const ui = defineUI(t.grammar, {
    controls: controls ?? {
      ratio: { kind: "number", min: 0.25, max: 16, value: 1, each: () => [{ key: "a" }, { key: "b" }] },
      gain: { kind: "number", min: 0, max: 2, value: 1, to: "param.gain" },
      hold: { kind: "toggle", value: false },
    },
  });
  return { ...t, ui, pkg: { name: "synth", ui } };
}
/** A part that logs operator values and has no UI. */
const logger = () => tiny("logger", { state: { got: list("f64", 100) }, inputs: false, ports: { in: { ratio: { seam: RATIO } } } }, { clock: () => ({ frame: true }), init: () => ({ got: [] }), events: { in: { ratio: 8 } }, step: (s) => s });

/** Two synths from one package, each wired exactly as one played alone. */
function duo(s = synth()) {
  const lead = s.grammar("lead"), bass = s.grammar("bass");
  let c = compose("duo").part(lead).part(bass);
  for (const p of [lead, bass]) c = c.wire(page.out.ratio, p.in.ratio).wire(page.out.gain, p.in.gain).wire(page.out.hold, p.in.hold);
  return { s, lead, bass, c };
}

test("ZNpW0f. two instances of one package each keep their keyed Control and their Control with to: no S119", () => {
  const { s, c } = duo();
  const ds = c.check({ packages: [s.pkg] });
  assert.deepEqual(ds.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  const built = c.build({ runtimes: [s.runtime], packages: [s.pkg] });
  const controls = built.parts.find((p) => p.name === "page").controls;
  assert.deepEqual(Object.keys(controls), ["lead.ratio", "lead.gain", "hold", "bass.ratio", "bass.gain"]);
  assert.deepEqual([controls["lead.ratio"].part, controls["lead.ratio"].control, controls["lead.ratio"].keyed], ["lead", "ratio", true]);
  assert.deepEqual([controls["bass.gain"].part, controls["bass.gain"].control], ["bass", "gain"]);
  assert.equal(controls.hold.part, undefined, "a shared Control belongs to no one part");
  assert.deepEqual(built.wires.map((w) => [w.from, w.to]), [
    ["page.out.lead.ratio", "lead.in.ratio"], ["page.out.lead.gain", "lead.in.gain"], ["page.out.hold", "lead.in.hold"],
    ["page.out.bass.ratio", "bass.in.ratio"], ["page.out.bass.gain", "bass.in.gain"], ["page.out.hold", "bass.in.hold"],
  ]);
});

test("ZNpW0f. one instance alone is part-qualified too, so adding a second renames nothing", () => {
  const s = synth(), lead = s.grammar("lead");
  const built = compose("solo").part(lead).wire(page.out.ratio, lead.in.ratio).build({ runtimes: [s.runtime], packages: [s.pkg] });
  assert.deepEqual(Object.keys(built.parts.find((p) => p.name === "page").controls), ["lead.ratio", "lead.gain", "hold"]);
  assert.deepEqual(built.wires.map((w) => w.from), ["page.out.lead.ratio"]);
});

test("ZNpW0f. S119 still refuses two shared declarations of one name that differ, and a scoped one never clashes", () => {
  const a = synth(), b = synth({ hold: { kind: "toggle", value: true }, ratio: { kind: "number", min: 0, max: 1, value: 0, each: () => [{ key: "z" }] } });
  const lead = a.grammar("lead"), bass = b.grammar("bass");
  const ds = compose("duo").part(lead).part(bass).check({ packages: [{ name: "synth", ui: a.ui }, { name: "synth", ui: b.ui }] }).filter((d) => d.code === "S119");
  assert.equal(ds.length, 0, "one package's UI serves both parts: equal declarations");
  // two packages: the differing shared `hold` is S119; the differing keyed `ratio` is not
  const other = tiny("drone", { state: { got: list("f64", 100) }, inputs: false, ports: { in: { ratio: { seam: RATIO }, hold: { seam: "Event<{ value: bool }>" } } } }, { clock: () => ({ frame: true }), init: () => ({ got: [] }), events: { in: { ratio: 8, hold: 4 } }, step: (s) => s });
  const oui = defineUI(other.grammar, { controls: { hold: { kind: "toggle", value: true }, ratio: { kind: "number", min: 0, max: 1, value: 0, each: () => [{ key: "z" }] } } });
  const clash = compose("duo").part(lead).part(other.grammar("pad")).check({ packages: [a.pkg, { name: "drone", ui: oui }] }).filter((d) => d.code === "S119");
  assert.equal(clash.length, 1, clash.map((d) => d.message).join("\n"));
  assert.match(clash[0].message, /'hold'/);
});

test("ZNpW0f. page.out.<control> into a part that does not declare it names no one part: S111 lists the qualified spellings; page.out[\"<part>.<control>\"] wires it", () => {
  const { s, lead, bass } = duo();
  const l = logger(), log = l.grammar("log");
  const base = compose("duo").part(lead).part(bass).part(log).wire(page.out.ratio, lead.in.ratio).wire(page.out.ratio, bass.in.ratio);
  const [d] = base.wire(page.out.ratio, log.in.ratio).check({ packages: [s.pkg] }).filter((x) => x.code === "S111");
  assert.ok(d, "an unqualified name into a part with no such Control is refused");
  assert.match(d.message, /lead\.ratio/);
  assert.match(d.message, /bass\.ratio/);
  assert.match(d.fix, /page\.out\["lead\.ratio"\]/);
  const ok = compose("duo").part(lead).part(bass).part(log).wire(page.out.ratio, lead.in.ratio).wire(page.out.ratio, bass.in.ratio).wire(page.out["bass.ratio"], log.in.ratio);
  assert.deepEqual(ok.check({ packages: [s.pkg] }).filter((x) => x.severity === "error"), []);
  assert.deepEqual(ok.build({ runtimes: [s.runtime, l.runtime], packages: [s.pkg] }).wires.map((w) => w.from), ["page.out.lead.ratio", "page.out.bass.ratio", "page.out.bass.ratio"]);
});
