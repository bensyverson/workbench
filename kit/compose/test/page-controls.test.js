// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// The page's outputs are the composed parts' declared Controls (project/2026-11-27-controls-draft.md, "In a
// composition"; build plan groups 18 to 25 and 49c's S121): `page.out.<control>` resolves from a loaded package's UI,
// one name is one Control, and a page wire is judged as any wire. The parts are a keyboard synth and a drum machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, page } from "../index.js";
import * as composeKit from "../index.js";
import { defineUI, list } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const NOTES = "Event<{ index: f64, on: bool, velocity: f64 }>";
/** A part named `n` taking notes (and a tempo, and the pointer on its Draw view), with its UI. @param {string} n @param {any} controls @param {Record<string, unknown>} [more] */
function part(n, controls, more = {}) {
  const t = tiny(n, {
    state: { got: list("f64", 100) }, inputs: false,
    ports: {
      in: { notes: { seam: NOTES }, tempo: { seam: "Event<{ value: f64 }>" }, word: { seam: "Event<{ value: str }>" },
        pointer: { seam: "Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@px, pointer: f64, buttons: f64, clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>" } },
      out: { view: { seam: "Draw<4>@px", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] }, chart: { seam: "Draw<4>@px", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] } },
    },
    frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [10, 10] }) } },
  }, { clock: () => ({ frame: true }), init: () => ({ got: [] }), events: { in: { notes: 64, tempo: 4, word: 4, pointer: 16 } }, step: (s) => s });
  const ui = defineUI(t.grammar, { controls, ...more });
  return { ...t, ui, pkg: { name: n, ui } };
}
const keys = () => part("keys", { notes: { kind: "triggers", count: 12, keys: ["KeyA", "KeyS"] }, tempo: { kind: "number", min: 40, max: 240, value: 120 } });
const drums = () => part("drums", { notes: { kind: "triggers", count: 12, keys: ["KeyA", "KeyS"] } });

test("18. page.out.<control> resolves from a loaded package's UI, and the composed page lists the Control", () => {
  const k = keys(), p = k.grammar("synth");
  const built = compose("play").part(p).wire(page.out.notes, p.in.notes).build({ runtimes: [k.runtime], packages: [k.pkg] });
  const pg = built.parts.find((x) => x.name === "page");
  assert.deepEqual({ kind: pg.controls.notes.kind, seam: pg.controls.notes.seam, records: pg.controls.notes.records, perFrame: pg.controls.notes.perFrame }, { kind: "triggers", seam: NOTES, records: "delta", perFrame: 32 });
  assert.equal(pg.controls.tempo.records, "state");
  assert.deepEqual(built.wires.map((w) => [w.from, w.to]), [["page.out.notes", "synth.in.notes"]]);
});

test("19. S111 for a Control no UI declares, with a did-you-mean, and for packages given without a UI", () => {
  const k = keys(), p = k.grammar("synth");
  const [d] = compose("play").part(p).wire(page.out.note, p.in.notes).check({ packages: [k.pkg] }).filter((x) => x.code === "S111");
  assert.match(d.message, /Did you mean 'notes'\?/);
  assert.match(d.message, /notes, tempo/);
  const [none] = compose("play").part(p).wire(page.out.notes, p.in.notes).check().filter((x) => x.code === "S111");
  assert.match(none.fix, /loaded packages/);
});

test("20. two equal declarations are one Control wired to two parts; differing ones are S119, and one with to declared twice is each part's own", () => {
  const k = keys(), d = drums(), a = k.grammar("synth"), b = d.grammar("kit");
  const both = compose("play").part(a).part(b).wire(page.out.notes, a.in.notes).wire(page.out.notes, b.in.notes);
  assert.deepEqual(both.check({ packages: [k.pkg, d.pkg] }).filter((x) => x.severity === "error"), []);
  const other = part("drums", { notes: { kind: "triggers", count: 8 } });
  const clash = compose("play").part(a).part(other.grammar("kit")).check({ packages: [k.pkg, other.pkg] }).filter((x) => x.code === "S119");
  assert.equal(clash.length, 1);
  assert.match(clash[0].message, /keys/);
  assert.match(clash[0].message, /drums/);
  const keyed = (n) => part(n, { tempo: { kind: "number", min: 40, max: 240, value: 120, to: "param.bpm" } });
  const x = keyed("keys"), y = keyed("drums");
  assert.equal(compose("play").part(x.grammar("a")).part(y.grammar("b")).check({ packages: [x.pkg, y.pkg] }).filter((d) => d.code === "S119").length, 0, "one with to, twice: each part's own (ZNpW0f)");
});

test("21. S120 warns for a declared Control whose input nothing wires, and not once another part wires it", () => {
  const k = keys(), p = k.grammar("synth");
  const ds = compose("play").part(p).wire(page.out.notes, p.in.notes).check({ packages: [k.pkg] }).filter((x) => x.code === "S120");
  assert.equal(ds.length, 1);
  assert.equal(ds[0].severity, "warning");
  assert.match(ds[0].message, /tempo/);
  const seq = tiny("seq", { state: { n: "f64" }, inputs: false, ports: { out: { tempo: { seam: "Event<{ value: f64 }>" } } } }, { clock: () => ({ frame: true }), init: () => ({ n: 0 }), step: (s) => s, events: { out: { tempo: 1 } } });
  const q = seq.grammar("q");
  assert.deepEqual(compose("play").part(p).part(q).wire(page.out.notes, p.in.notes).wire(q.out.tempo, p.in.tempo).check({ packages: [k.pkg] }).filter((x) => x.code === "S120"), []);
});

test("22. a page wire into an input of another seam is refused as any wire is", () => {
  const k = keys(), p = k.grammar("synth");
  const ds = compose("play").part(p).wire(page.out.tempo, p.in.word).check({ packages: [k.pkg] }).filter((x) => x.severity === "error");
  assert.ok(ds.some((d) => /^S20/.test(d.code)), ds.map((d) => d.code).join(" "));
});

test("23. S116 counts each Control's perFrame, and says folds for state and carries over for delta", () => {
  const t = tiny("keys", { state: { got: list("f64", 100) }, inputs: false, ports: { in: { notes: { seam: NOTES }, tempo: { seam: "Event<{ value: f64 }>" } } } }, { clock: () => ({ frame: true }), init: () => ({ got: [] }), events: { in: { notes: 2, tempo: 2 } }, step: (s) => s });
  const ui = defineUI(t.grammar, { controls: { notes: { kind: "triggers", count: 12 }, tempo: { kind: "number", min: 40, max: 240, value: 120, perFrame: 8 } } });
  const p = t.grammar("synth");
  const ds = compose("play").part(p).wire(page.out.notes, p.in.notes).wire(page.out.tempo, p.in.tempo).check({ runtimes: [t.runtime], packages: [{ name: "keys", ui }] }).filter((x) => x.code === "S116");
  assert.equal(ds.length, 2, ds.map((d) => d.message).join("\n"));
  assert.match(ds.find((d) => /notes/.test(d.message)).message, /carries over/);
  assert.match(ds.find((d) => /tempo/.test(d.message)).message, /folds/);
});

test("24. PAGE_CONTROLS, PAGE_CHANGES_PER_FRAME, pageInputProblem and the pageRuntime constant are not exported", () => {
  for (const n of ["PAGE_CONTROLS", "PAGE_CHANGES_PER_FRAME", "pageInputProblem", "pageRuntime"]) assert.equal(n in composeKit, false, n);
  assert.equal(typeof composeKit.pageRuntimeFor, "function");
});

test("25. a part's entry carries pointer from its UI's stage and view tiles", () => {
  const k = part("lens", {}, { stage: { draw: "view", pointer: "pointer" }, tiles: { c: { title: "Chart", place: { tabWith: "stage" }, body: [{ kind: "view", draw: "chart", pointer: "pointer" }] } } });
  const built = compose("bench").part(k.grammar("bench")).build({ packages: [k.pkg] });
  assert.deepEqual({ ...built.parts.find((x) => x.name === "bench").pointer }, { view: "pointer", chart: "pointer" });
});

test("49c. S121 warns for two Controls on one code, and not for one Control with two codes on one button", () => {
  const a = part("keys", { notes: { kind: "triggers", count: 4, keys: ["KeyA"] }, tempo: { kind: "number", min: 40, max: 240, value: 120, keys: { down: ["KeyA"], up: ["KeyD"] } } });
  const p = a.grammar("synth");
  const ds = compose("play").part(p).wire(page.out.notes, p.in.notes).wire(page.out.tempo, p.in.tempo).check({ packages: [a.pkg] }).filter((x) => x.code === "S121");
  assert.equal(ds.length, 1);
  assert.equal(ds[0].severity, "warning");
  assert.match(ds[0].message, /KeyA/);
  assert.match(ds[0].message, /notes/);
  assert.match(ds[0].message, /tempo/);
  const pad = part("game", { tempo: { kind: "number", min: 0, max: 9, value: 1, keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown"] } } });
  const g = pad.grammar("g");
  assert.deepEqual(compose("play").part(g).wire(page.out.tempo, g.in.tempo).check({ packages: [pad.pkg] }).filter((x) => x.code === "S121"), []);
});
