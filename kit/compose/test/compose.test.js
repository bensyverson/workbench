// kit/compose: a glue program wires parts built by their own Grammars, relates their frames, and gets back every S
// diagnostic at once (each naming both sides) or the composed record, with every wire's conversion planned as data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, COMPOSE_CODES, formatDiagnostic, ComposeError, scanGlue } from "../index.js";
import { defineDialect, defineGrammar, exact, vector, struct, name, ref, data, lambda } from "../../define/index.js";
import { maze, particles } from "../../define/fixtures/seams-dialects.js";

/** Codes the cases below saw. @type {Set<string>} */
const seen = new Set();
/** @param {any} c @param {any} [o] */
const check = (c, o) => { const ds = c.check(o); for (const d of ds) seen.add(d.code); return ds; };
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

const GRID = ["##########", "#..c...c.#", "#.##.###.#", "#c.....c.#", "#.###.##.#", "#...c....#", "#.#.###c.#", "##########"];
const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";
const level = () => /** @type {any} */ (maze()("level").grid(GRID).control(steer));
const fx = () => /** @type {any} */ (particles()("fx").bounds({ width: 320, height: 320 })
  .emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn("(p, rng) => { p.pos = ev.at; p.life = inp.radius; }"));
const packages = [{ name: "maze", version: "0.2.0" }, { name: "particles", version: "0.3.0" }];

test("the coin-bursts composition checks clean and plans the burst's position ×32 +[16, 48]", () => {
  const l = level(), f = fx();
  const c = compose("coin-bursts").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst).show(f);
  assert.deepEqual(check(c, { packages }), []);
  const r = c.build({ packages });
  assert.equal(r.name, "coin-bursts");
  assert.deepEqual(r.parts.map((/** @type {any} */ p) => [p.name, p.dialect, p.version]), [["level", "maze", "0.2.0"], ["fx", "particles", "0.3.0"]]);
  assert.equal(r.show, "fx");
  assert.deepEqual(r.wires, [{
    from: "level.out.picked", to: "fx.in.burst",
    convert: [{ field: "at", kind: "point", from: "maze.cell", to: "particles.px", scale: [32, 32], offset: [16, 48] }],
    rename: {}, delay: false, dropped: [], delivery: "reliable",
  }]);
  assert.deepEqual(c.plan(), ["level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +[16, 48]"]);
});

test("a producer's extra record fields are dropped and listed; an explicit edge plans as written", () => {
  const l = level(), f = fx();
  const c = compose("x").part(l).part(f).frame(l.frame.cell, f.frame.px, { scale: 32, offset: [16, 48] }).wire(l.out.picked, f.in.burst);
  assert.deepEqual(check(c), []);
  assert.deepEqual(c.build().wires[0].convert[0].offset, [16, 48]);
});

// Small Dialects for the S cases: each declares the ports and frames it is given.
/** @param {string} n @param {Record<string, any>} ports @param {Record<string, any>} [frames] @param {Function} [edges] */
function tiny(n, ports, frames = { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [10, 10] }) } }, edges) {
  const d = defineDialect(/** @type {any} */ ({
    name: n, numberType: "f64", text: () => "",
    types: { v2: vector(2, "f64"), v3: vector(3, "f64") },
    spaces: { s: { pure: true } },
    objects: { In: { label: "the inputs (inp)", members: {} } },
    globals: { inp: "In" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    state: { t: "f64", at: "v2", here: struct({ at: "v2" }) },
    frames, ...(edges ? { edges } : {}),
    ports, inputs: { object: "In", name: "inp" },
  }));
  return defineGrammar(d, { root: n, constructs: { [n]: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
}
const ev = (/** @type {string} */ seam) => ({ seam, note: "n" });
/** A producer `a` with output `o`, a consumer `b` with input `i`, wired; frames related by `rel` when given. */
function pair(/** @type {any} */ o, /** @type {any} */ i, /** @type {{ rel?: any, fa?: any, fb?: any, opts?: any }} */ x = {}) {
  const A = tiny("prod", { out: { o } }, x.fa), B = tiny("cons", { in: { i } }, x.fb);
  const a = /** @type {any} */ (A("a")), b = /** @type {any} */ (B("b"));
  const c = compose("t").part(a).part(b);
  if (x.rel !== undefined) c.frame(a.frame.px, b.frame.px, x.rel);
  return c.wire(a.out.o, b.in.i, x.opts);
}
/** Every diagnostic of a check, each printed with both sides it has. */
const printed = (/** @type {any} */ c) => check(c).map((/** @type {any} */ d) => formatDiagnostic(d));
/** @param {string} p */
const twoSides = (p) => { assert.match(p, /\n {2}from: /, p); assert.match(p, /\n {2}to: {3}/, p); };

test("S101: two parts with one name, both named", () => {
  const ds = check(compose("t").part(level()).part(/** @type {any} */ (particles()("level").bounds({ width: 9, height: 9 }))));
  assert.deepEqual(codes(ds), ["S101"]);
  twoSides(formatDiagnostic(ds[0]));
});

test("S102: a wire whose ends are swapped, a show of something not a part, a bad option", () => {
  const l = level(), f = fx();
  const ds = check(compose("t").part(l).part(f).wire(f.in.burst, l.out.picked).show(42));
  assert.deepEqual(codes(ds), ["S102", "S102", "S102"]);
  twoSides(formatDiagnostic(ds[0]));
  assert.deepEqual(codes(check(compose("t").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst, { delay: "yes" }))), ["S102"]);
  assert.deepEqual(codes(check(compose("t").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst, { renames: {} }))), ["S102"]);
  assert.deepEqual(codes(check(compose("Bad Name"))), ["S102"]);
});

test("S111: a misspelled input, with what the part has and a did-you-mean", () => {
  const l = level(), f = fx();
  const ds = check(compose("t").part(l).part(f).wire(l.out.picked, f.in.brust));
  assert.deepEqual(codes(ds), ["S111"]);
  assert.match(ds[0].message, /has no input 'brust'\. Did you mean 'burst'\? Its inputs: burst, radius, wind/);
  const p = formatDiagnostic(ds[0]);
  twoSides(p);
  assert.match(p, /to: {3}fx\.in\.brust +has burst, radius, wind/);
  assert.match(ds[0].file, /compose\.test\.js$/);
});

test("S112, S113, S114: an input wired twice, a required input with no wire, a part wired to itself", () => {
  const A = tiny("prod", { out: { o: ev("Event<{ n: f64 }>"), o2: ev("Event<{ n: f64 }>") } }), B = tiny("cons", { in: { i: ev("Event<{ n: f64 }>"), need: { seam: "f64", required: true } } });
  const a = /** @type {any} */ (A("a")), b = /** @type {any} */ (B("b"));
  const twice = check(compose("t").part(a).part(b).wire(a.out.o, b.in.i).wire(a.out.o2, b.in.i));
  assert.deepEqual(codes(twice), ["S112", "S113"]);
  twoSides(formatDiagnostic(twice[0]));
  assert.match(formatDiagnostic(twice[1]), /\n {2}to: {3}b\.in\.need/);
  const S = tiny("both", { out: { o: ev("Event<{ n: f64 }>") }, in: { i: ev("Event<{ n: f64 }>") } });
  const s = /** @type {any} */ (S("s"));
  const self = check(compose("t").part(s).wire(s.out.o, s.in.i));
  assert.deepEqual(codes(self), ["S114"]);
  twoSides(formatDiagnostic(self[0]));
});

test("S201–S204, S252, S255: seam mismatches, field by field, each with both sides", () => {
  for (const [o, i, code] of /** @type {Array<[string, string, string]>} */ ([
    ["Event<{ n: f64 }>", "f64", "S201"],
    ["Event<{ n: f64 }>", "Event<{ m: f64 }>", "S202"],
    ["Event<{ k: 'coin' | 'key' }>", "Event<{ k: 'coin' }>", "S203"],
    ["Event<{ l: list<f64, 8> }>", "Event<{ l: list<f64, 4> }>", "S204"],
    ["Event<{ r: f64 }>", "Event<{ r: f64@px }>", "S252"],
    ["Event<{ p: point2@px }>", "Event<{ p: vec2@px }>", "S255"],
  ])) {
    const ds = printed(pair(ev(o), i === "f64" ? { seam: "f64", default: 0 } : ev(i), { rel: { scale: 1 } }));
    assert.equal(ds.length, 1, ds.join("\n"));
    assert.ok(ds[0].includes(` ${code} `), ds[0]);
    twoSides(ds[0]);
  }
});

test("S205: a rename with an unknown field on either side, with a did-you-mean; a valid rename feeds pos into at", () => {
  const o = ev("Event<{ pos: point2@px }>"), i = ev("Event<{ at: point2@px }>");
  assert.deepEqual(codes(check(pair(o, i, { rel: { scale: 2 } }))), ["S202"], "unrenamed, the names do not meet");
  const good = pair(o, i, { rel: { scale: 2 }, opts: { rename: { pos: "at" } } });
  assert.deepEqual(check(good), []);
  const w = good.build().wires[0];
  assert.deepEqual(w.rename, { pos: "at" });
  assert.deepEqual(w.convert.map((/** @type {any} */ c) => c.field), ["at"]);
  const src = check(pair(o, i, { rel: { scale: 2 }, opts: { rename: { poss: "at" } } }));
  assert.deepEqual(codes(src), ["S205"], "a refused rename is one mistake: the wire is not compared further");
  assert.match(src[0].message, /no field 'poss'.*did you mean 'pos'/i);
  twoSides(formatDiagnostic(src[0]));
  const dst = check(pair(o, i, { rel: { scale: 2 }, opts: { rename: { pos: "att" } } }));
  assert.deepEqual(codes(dst), ["S205"]);
  assert.match(dst[0].message, /no field 'att'.*did you mean 'at'/i);
});

test("S115: a cycle of wires names the loop; a delay on either wire breaks it; glue order changes nothing", () => {
  const S = (/** @type {string} */ n) => tiny(n, { out: { o: ev("Event<{ n: f64 }>") }, in: { i: ev("Event<{ n: f64 }>") } });
  const A = S("one"), B = S("two");
  /** @param {any} [da] @param {any} [db] @param {boolean} [swap] */
  const loop = (da, db, swap = false) => {
    const a = /** @type {any} */ (A("a")), b = /** @type {any} */ (B("b"));
    const c = compose("t").part(a).part(b);
    return swap ? c.wire(b.out.o, a.in.i, db).wire(a.out.o, b.in.i, da) : c.wire(a.out.o, b.in.i, da).wire(b.out.o, a.in.i, db);
  };
  const ds = check(loop());
  assert.deepEqual(codes(ds), ["S115"]);
  assert.match(ds[0].message, /a → b → a/);
  twoSides(formatDiagnostic(ds[0]));
  assert.deepEqual(check(loop(undefined, undefined, true)).map((/** @type {any} */ d) => [d.code, d.message]), ds.map((/** @type {any} */ d) => [d.code, d.message]), "the same verdict, word for word");
  assert.deepEqual(check(loop({ delay: true })), []);
  assert.deepEqual(check(loop(undefined, { delay: true })), []);
  assert.deepEqual(check(loop({ delay: true }, undefined, true)), []);
  assert.deepEqual(loop({ delay: true }).build().wires.map((/** @type {any} */ w) => w.delay), [true, false]);
});

test("S251: tagged on both sides and no frame path, with the draft's fix", () => {
  const ds = printed(pair(ev("Event<{ at: point2@px }>"), ev("Event<{ at: point2@px }>")));
  assert.equal(ds.length, 1);
  assert.match(ds[0], / S251 a\.out\.o cannot feed b\.in\.i/);
  assert.match(ds[0], /fix: write \.frame\(a\.frame\.px, b\.frame\.px, "fit"\)/);
  twoSides(ds[0]);
});

test("S253: two frame paths that disagree, naming the edges on each", () => {
  const A = tiny("prod", { out: { o: ev("Event<{ at: point2@px }>") } }, { px: { dims: 2, note: "p" }, cell: { dims: 2, note: "c" } }, () => [{ from: "cell", to: "px", scale: 2 }]);
  const B = tiny("cons", { in: { i: ev("Event<{ at: point2@px }>") } });
  const a = /** @type {any} */ (A("a")), b = /** @type {any} */ (B("b"));
  const ds = check(compose("t").part(a).part(b).frame(a.frame.px, b.frame.px, { scale: 1 }).frame(a.frame.cell, b.frame.px, { scale: 3 }));
  assert.deepEqual(codes(ds), ["S253"]);
  assert.match(ds[0].message, /prod\.cell → prod\.px \(prod's edges\)/);
  twoSides(formatDiagnostic(ds[0]));
});

test("S254: a quantity across a scale that differs per axis", () => {
  const ds = printed(pair(ev("Event<{ r: f64@px }>"), ev("Event<{ r: f64@px }>"), { rel: { scale: [1, 2] } }));
  assert.equal(ds.length, 1);
  assert.ok(ds[0].includes(" S254 "));
  twoSides(ds[0]);
});

test("S256 and S257: fit without an extent, and a malformed edge", () => {
  const noExtent = { px: { dims: 2, note: "pixels" } };
  const fit = printed(pair(ev("Event<{ at: point2@px }>"), ev("Event<{ at: point2@px }>"), { rel: "fit", fb: noExtent }));
  assert.equal(fit.length, 1);
  assert.ok(fit[0].includes(" S256 "), fit[0]);
  twoSides(fit[0]);
  const bad = printed(pair(ev("Event<{ at: point2@px }>"), ev("Event<{ at: point2@px }>"), { rel: { scale: 0 } }));
  assert.equal(bad.length, 1);
  assert.ok(bad[0].includes(" S257 "), bad[0]);
  twoSides(bad[0]);
});

test("a rate converts by its frame's edge alone; the kit's s joins every part with no .frame", () => {
  const c = pair(ev("Event<{ v: vec2@px/s, d: f64@s }>"), ev("Event<{ v: vec2@px/s, d: f64@s }>"), { rel: { scale: 4, offset: 1 } });
  assert.deepEqual(check(c), []);
  const conv = c.build().wires[0].convert;
  assert.deepEqual(conv.find((/** @type {any} */ x) => x.field === "v"), { field: "v", kind: "vector", rate: true, from: "prod.px", to: "cons.px", scale: [4, 4], offset: [0, 0] });
  assert.deepEqual(conv.find((/** @type {any} */ x) => x.field === "d"), { field: "d", kind: "quantity", from: "s", to: "s", scale: [1], offset: [0] });
});

test("S301: a handle read as a value at build time", () => {
  const l = level(), f = fx();
  const n = l.out.player * 2;
  assert.ok(Number.isNaN(n));
  const ds = check(compose("t").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst));
  assert.deepEqual(codes(ds), ["S301"]);
  assert.match(ds[0].message, /level\.out\.player is read as a value/);
  assert.match(formatDiagnostic(ds[0]), /\n {2}from: level\.out\.player/);
});

test("a part that does not build stops the composition with its own diagnostics, prefixed with its name", () => {
  const bad = /** @type {any} */ (maze()("level").grid(GRID));
  const ds = check(compose("t").part(bad));
  assert.deepEqual(codes(ds), ["B005"]);
  assert.match(ds[0].message, /^part 'level' \(maze\): /);
  assert.throws(() => compose("t").part(bad).build(), ComposeError);
});

test("every S code has a failing case above", () => {
  for (const c of Object.keys(COMPOSE_CODES)) assert.ok(seen.has(c), `no case for ${c}`);
});

void ref; void data;

test("scanGlue: a glue imports kit/compose, kit/define and the workbench's packages by bare name, nothing else", () => {
  const ok = scanGlue('import { compose } from "kit/compose";\nimport { maze } from "maze";\nimport { particles } from "particles";\nexport default () => 0;', ["maze", "particles"]);
  assert.deepEqual(ok.diagnostics, []);
  assert.deepEqual(ok.imports.map((/** @type {any} */ i) => [i.specifier, i.resolved]), [["kit/compose", "kit/compose"], ["maze", "maze"], ["particles", "particles"]]);
  const bad = scanGlue('import fs from "node:fs";\nimport { x } from "maze/maze.dialect.js";\nexport default () => 0;', ["maze"]);
  assert.deepEqual(bad.diagnostics.map((/** @type {any} */ d) => [d.code, d.line]), [["K007", 1], ["K007", 2]]);
  assert.match(bad.diagnostics[0].message, /workbench\.js imports "node:fs", which it may not; a glue program imports only "kit\/compose", "kit\/define", "maze"/);
});
