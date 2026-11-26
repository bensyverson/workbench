// A Dialect's seams (the seams draft as ruled 2026-11-26): ports, frames, edges, inputs and an Event input's
// record, judged by defineDialect with D024–D030 and D032 at the Dialect's line; D031 is defineGrammar's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, name, ref, data, lambda, DefinitionError, DEFINE_CODES } from "../index.js";
import { mazeDecl, particlesDecl, mazeGrammar, particlesGrammar } from "../fixtures/seams-dialects.js";

/**
 * The diagnostics defineDialect gives a declaration after `change` edits it ([] when it defines clean).
 * @param {() => Record<string, any>} make @param {(d: Record<string, any>) => void} change
 */
function refused(make, change) {
  const d = make();
  change(d);
  try { defineDialect(/** @type {any} */ (d)); } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return /** @type {any[]} */ (e.diagnostics);
  }
  return [];
}
/** @param {any[]} ds */
const codes = (ds) => ds.map((x) => x.code);
const maze = (/** @type {(d: Record<string, any>) => void} */ f) => refused(mazeDecl, f);
const particles = (/** @type {(d: Record<string, any>) => void} */ f) => refused(particlesDecl, f);

test("the ruled maze and particles define clean, and the Dialect carries its seams parsed", () => {
  const m = /** @type {any} */ (defineDialect(/** @type {any} */ (mazeDecl())));
  assert.deepEqual(Object.keys(m.seams.out), ["picked", "player", "home", "score"]);
  assert.equal(m.seams.out.picked.seamText, "Event<{ at: point2@cell }>");
  assert.equal(m.seams.out.picked.from, undefined);
  assert.deepEqual(m.seams.frames.cell.dims, 2);
  const p = /** @type {any} */ (defineDialect(/** @type {any} */ (particlesDecl())));
  assert.deepEqual(p.seams.in.burst.delivery, "reliable");
  assert.deepEqual(p.seams.in.burst.record, { name: "ev", slots: ["spawn"] });
  assert.equal(p.seams.in.radius.default, 40);
  assert.equal(p.seams.in.wind.seamText, "vec2@px/s");
  assert.deepEqual(p.seams.inputs, { object: "In", name: "inp" });
  assert.deepEqual(particles((d) => { d.ports.in.burst.delivery = { keepLast: 4 }; }), []);
  assert.deepEqual(particles((d) => { d.ports.in.burst.delivery = "reliable"; }), []);
});

test("a Dialect's line and path: every seam diagnostic is placed at the defineDialect call", () => {
  const ds = maze((d) => { d.ports.out.score.form = "score"; });
  assert.deepEqual(codes(ds), ["D024"]);
  assert.deepEqual(ds[0].path, ["ports", "out", "score", "form"]);
  assert.match(ds[0].file, /seams-define\.test\.js$/);
});

test("D024: a malformed port", () => {
  assert.match(maze((d) => { d.ports.out.score.form = "score"; })[0].message, /did you mean 'from'/i);
  assert.deepEqual(codes(maze((d) => { delete d.ports.out.score.seam; })), ["D024"]);
  assert.deepEqual(codes(maze((d) => { delete d.ports.out.score.from; })), ["D024"], "a value output needs a from");
  assert.deepEqual(codes(maze((d) => { delete d.ports.out.player.note; })), ["D024"], "a tagged port needs a note");
  assert.deepEqual(codes(maze((d) => { delete d.ports.out.picked.note; })), ["D024"], "an Event port needs a note");
  assert.deepEqual(codes(maze((d) => { d.ports.out["2x"] = { seam: "f64", from: "score" }; })), ["D024"]);
  assert.deepEqual(codes(maze((d) => { d.ports = []; })), ["D024"]);
  assert.deepEqual(codes(maze((d) => { d.ports.sideways = {}; })), ["D024"]);
});

test("D025: a seam that does not parse, names an undeclared frame, or tags with a frame of other dims", () => {
  assert.deepEqual(codes(maze((d) => { d.ports.out.score.seam = "f32"; })), ["D025"]);
  const ds = maze((d) => { d.ports.out.player.seam = "point2@cel"; });
  assert.deepEqual(codes(ds), ["D025"]);
  assert.match(ds[0].message, /did you mean 'cell'/i);
  assert.deepEqual(codes(maze((d) => { d.ports.out.player.seam = "point3@cell"; })), ["D025"]);
  assert.match(maze((d) => { d.ports.out.score.seam = "f64@cell/ms"; })[0].message, /per second/);
});

test("D026: an Event output with a from, and a value output's from that names nothing or breaks the lambda rules", () => {
  const ev = maze((d) => { d.ports.out.picked.from = "picked"; });
  assert.deepEqual(codes(ev), ["D026"]);
  assert.match(ev[0].message, /runtime pushes/);
  assert.deepEqual(ev[0].path, ["ports", "out", "picked", "from"]);
  assert.deepEqual(codes(maze((d) => { d.ports.out.score.from = 3; })), ["D026"]);
  assert.deepEqual(codes(maze((d) => { d.ports.out.score.from = "scroe"; })), ["D026"]);
  assert.deepEqual(codes(maze((d) => { d.ports.out.score.from = (/** @type {any} */ s) => { s.score = 1; return s.score; }; })), ["D026"]);
});

test("D027: a local type that does not pair with its seam", () => {
  assert.deepEqual(codes(maze((d) => { d.ports.out.score.seam = "point2@cell"; })), ["D027"]);
  assert.deepEqual(codes(maze((d) => { d.ports.out.where = { seam: "{ x: f64, y: f64, z: f64 }", from: "player" }; })), ["D027"], "a record the state's struct does not match");
  assert.deepEqual(codes(particles((d) => { d.types = {}; d.objects.Particle.members = { life: { value: "f64", write: true } }; })), ["D027", "D027"], "a point or vector input with no vector type of its dims: burst's record and wind");
  assert.deepEqual(codes(particles((d) => { d.ports.in.wind.type = "vec3"; })), ["D027"]);
});

test("D028: a value input's default and required, an Event input's delivery", () => {
  assert.deepEqual(codes(particles((d) => { delete d.ports.in.radius.default; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.radius.required = true; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.radius.default = "40"; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.default = []; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.delivery = "lossy"; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.delivery = { keepLast: 0 }; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.delivery = { keepLast: 2.5 }; })), ["D028"]);
  assert.deepEqual(codes(particles((d) => { d.ports.in.radius.delivery = "reliable"; })), ["D028"]);
});

test("D029: value inputs and the inputs object", () => {
  assert.deepEqual(codes(particles((d) => { delete d.inputs; })), ["D029"]);
  assert.deepEqual(codes(particles((d) => { d.inputs.object = "Inn"; })), ["D029"]);
  assert.deepEqual(codes(particles((d) => { d.objects.In.members = { radius: "f64" }; })), ["D029"]);
  assert.deepEqual(codes(particles((d) => { delete d.globals.inp; })), ["D029"]);
});

test("D030: a malformed frame or edges, and a frame named like the kit's s", () => {
  assert.deepEqual(codes(maze((d) => { d.frames.cell.dims = 4; })), ["D030"]);
  assert.deepEqual(codes(maze((d) => { delete d.frames.cell.note; })), ["D030"]);
  assert.deepEqual(codes(maze((d) => { d.frames.cell.extent = [1, 2]; })), ["D030"]);
  assert.deepEqual(codes(maze((d) => { d.edges = []; })), ["D030"]);
  const s = maze((d) => { d.frames.s = { dims: 1, note: "seconds" }; });
  assert.deepEqual(codes(s), ["D030"]);
  assert.match(s[0].message, /the kit/);
  assert.deepEqual(maze((d) => { d.ports.out.t = { seam: "f64@s", from: "t", note: "seconds since the start" }; }), [], "every package may name the kit's s");
});

test("D032: an Event input's record: { name, slots }", () => {
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.record = "ev"; })), ["D032"]);
  const slot = particles((d) => { d.ports.in.burst.record.slots = ["spwan"]; });
  assert.deepEqual(codes(slot), ["D032"]);
  assert.match(slot[0].message, /did you mean 'spawn'/i);
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.record.name = "inp"; })), ["D032"], "a global's name");
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.record.name = "Particle"; })), ["D032"], "an object's name");
  assert.deepEqual(codes(particles((d) => { d.ports.in.radius.record = { name: "r", slots: ["spawn"] }; })), ["D032"], "only an Event has a record");
  assert.deepEqual(codes(particles((d) => { d.ports.in.pulse = { seam: "Event<{ n: f64 }>", note: "a pulse", record: { name: "ev", slots: ["rate"] } }; })), ["D032"], "two inputs, one name");
  assert.deepEqual(codes(particles((d) => { d.ports.in.burst.record.slots = []; })), ["D032"]);
});

test("D031: a Grammar's ref(\"in\") with no ports.in, name(\"in\"), a slot named like a handle, a bad kind", () => {
  const m = defineDialect(/** @type {any} */ (mazeDecl()));
  const p = defineDialect(/** @type {any} */ (particlesDecl()));
  /** @param {any} dialect @param {any} def */
  const g = (dialect, def) => { try { defineGrammar(dialect, def); return []; } catch (e) { return codes(/** @type {any} */ (e).diagnostics); } };
  assert.deepEqual(g(m, { root: "m", constructs: { m: { opens: [name(), ref("in")] } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name()], slots: { tag: { kind: "decl", args: [name("in")] } } } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name()], slots: { frame: { kind: "decl", args: [data("number")] } } } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name()] }, out: { parent: "m", opens: [name()] } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name(), ref("in", { kind: "both" })] } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name()], slots: { k: { kind: "decl", args: [ref("m", { kind: "event" })] } } } } }), ["D031"]);
  assert.deepEqual(g(p, { root: "m", constructs: { m: { opens: [name(), ref("in", { kind: "value" })], slots: { r: { kind: "decl", args: [lambda("rate")] } } } } }), []);
  assert.doesNotThrow(() => { mazeGrammar(m); particlesGrammar(p); });
});

test("every seam code is in DEFINE_CODES", () => {
  for (const c of ["D024", "D025", "D026", "D027", "D028", "D029", "D030", "D031", "D032"]) assert.ok(Object.hasOwn(DEFINE_CODES, c), c);
});
