// The handles every generated builder carries (.out, .in, .frame), made inside kit/define so a builder's own
// diagnostics still point at the author's line; and `ref("in")`, the namespace the kit fills from ports.in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, ref, BuildError, isHandle } from "../index.js";
import { programOf } from "../grammar.js";
import { valueReadsOf } from "../handles.js";
import { maze, particles, particlesDecl, particlesGrammar, GRID } from "../fixtures/seams-dialects.js";

const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";

test("every builder of a chain has .out, .in and .frame handles naming its Program's ports and frames", () => {
  const level = maze()("level").grid(GRID).control(steer);
  const h = /** @type {any} */ (level).out.picked;
  assert.ok(isHandle(h));
  assert.equal(h.side, "out");
  assert.equal(h.name, "picked");
  assert.equal(h.part, "level");
  assert.equal(h.seam, "Event<{ at: point2@cell }>");
  assert.equal(h.known, true);
  assert.equal(/** @type {any} */ (level).out.picked, h, "one handle per port");
  assert.equal(/** @type {any} */ (level).out.pikced.known, false, "a name the part lacks is a handle compose reports (S111)");
  assert.equal(/** @type {any} */ (level).frame.cell.dims, 2);
  const fx = particles()("fx").bounds({ width: 320, height: 320 });
  const child = /** @type {any} */ (fx).emitter("pop", { x: 1, y: 1, trigger: "burst" });
  assert.equal(programOf(child.in.burst.program), undefined);
  assert.equal(child.in.burst.program, programOf(fx), "a child builder's handles are its Program's");
  assert.equal(child.in.radius.seam, "f64@px");
});

test("handles are read-only", () => {
  const level = /** @type {any} */ (maze()("level"));
  assert.throws(() => { level.out.picked = 1; }, TypeError);
  assert.throws(() => { level.out.picked.name = "x"; }, TypeError);
  assert.throws(() => { level.out = {}; }, TypeError);
});

test("a builder diagnostic still points at the author's line with handles in use", () => {
  const level = /** @type {any} */ (maze()("level"));
  void level.out.player;
  const line = new Error().stack?.split("\n")[1].match(/:(\d+):\d+\)?$/)?.[1];
  level.grid(GRID).control(steer).tick(5); // B004 on this line
  try { level.build(); assert.fail("tick(5) builds"); } catch (e) {
    assert.ok(e instanceof BuildError);
    const d = e.diagnostics[0];
    assert.equal(d.code, "B004");
    assert.match(d.file, /seams-handles\.test\.js$/);
    assert.equal(d.loc.start.line, Number(line) + 1);
  }
});

test("a handle read as a number or a string is recorded on its Program, for compose's S301", () => {
  const level = /** @type {any} */ (maze()("level"));
  const v = level.out.player * 2;
  assert.ok(Number.isNaN(v));
  const reads = valueReadsOf(programOf(level));
  assert.equal(reads.length, 1);
  assert.equal(reads[0].handle, "level.out.player");
  assert.match(reads[0].file, /seams-handles\.test\.js$/);
  void `${level.frame.cell}`;
  assert.equal(valueReadsOf(programOf(level)).length, 2);
});

test("a Dialect with no seams still answers .out with handles it does not have", () => {
  const d = particlesDecl();
  for (const k of ["ports", "inputs", "frames"]) delete d[k];
  delete d.objects.In;
  delete d.globals.inp;
  const g = particlesGrammar(defineDialect(/** @type {any} */ (d)), ref("emitter"));
  const b = /** @type {any} */ (g("x"));
  assert.equal(b.out.anything.known, false);
  assert.equal(b.frame.px.known, false);
});

/** @param {any} b */
const build = (b) => { try { b.build(); return []; } catch (e) { return /** @type {any[]} */ (/** @type {any} */ (e).diagnostics); } };
const spawn = "(p, rng) => { p.life = 1; }";
/** @param {any} g @param {string} trigger */
const fx = (g, trigger) => g("fx").bounds({ width: 9, height: 9 }).emitter("pop", { x: 1, y: 1, trigger }).rate("() => 0").spawn(spawn);

test("ref(\"in\") names an input; a wrong one is B003 with a did-you-mean", () => {
  const g = particlesGrammar(defineDialect(/** @type {any} */ (particlesDecl())), ref("in"));
  assert.deepEqual(build(fx(g, "burst")), []);
  assert.deepEqual(build(fx(g, "radius")), [], "with no kind, any input");
  const ds = build(fx(g, "brust"));
  assert.deepEqual(ds.map((d) => d.code), ["B003"]);
  assert.match(ds[0].message, /there is no input 'brust'.*did you mean 'burst'/i);
  assert.match(ds[0].file, /seams-handles\.test\.js$/);
});

test("ref(\"in\", { kind }) takes only that kind of input; another is B003 naming the kind", () => {
  const ev = particlesGrammar(defineDialect(/** @type {any} */ (particlesDecl())), ref("in", { kind: "event" }));
  assert.deepEqual(build(fx(ev, "burst")), []);
  const wrong = build(fx(ev, "radius"));
  assert.deepEqual(wrong.map((d) => d.code), ["B003"]);
  assert.match(wrong[0].message, /'radius' is a value input; this takes an Event input/);
  assert.match(wrong[0].message, /takes an Event input: 'burst'/);
  const val = particlesGrammar(defineDialect(/** @type {any} */ (particlesDecl())), ref("in", { kind: "value" }));
  assert.deepEqual(build(fx(val, "radius")), []);
  assert.match(build(fx(val, "burst"))[0].message, /'burst' is an Event input; this takes a value input/);
});
