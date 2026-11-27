// kit/page (the draw-list draft's ruling of 2026-11-26, leaf hca0YM): a composed run mounted on a canvas. It
// creates the run and advances it on the host's frames, draws the shown part's Draw list each frame with kit/draw's
// drawCanvas and the decoded image sources, maps keys to the page controls, reports the draw-time profile check
// as a page diagnostic, and exposes what a host UI shows next. Driven here by hand: a fake 2D context, a frame
// source the test ticks, and synthetic key events.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createPage, DEFAULT_KEYS, PAGE_CODES } from "../index.js";
import { PAGE_CONTROLS } from "../../compose/index.js";
import { RESERVED_LETTERS } from "../../define/codes.js";
import { bench, fakeContext, frames } from "../fixtures/bench.js";

/** A page on the bench, with a decoder that records what it was handed. @param {Parameters<typeof bench>[0]} [b] @param {Record<string, any>} [o] */
async function mount(b, o = {}) {
  const { composed, runtimes, packages } = await bench(b);
  const ctx = fakeContext(), f = frames();
  /** @type {any[]} */
  const decoded = [];
  const decode = async (/** @type {Uint8Array} */ bytes, /** @type {any} */ info) => { decoded.push({ bytes, ...info }); return { bitmap: info.name }; };
  const p = createPage({ composed, runtimes, packages, context: ctx, requestFrame: f.requestFrame, decode, ...o });
  await p.ready;
  return { page: p, ctx, f, decoded, composed };
}
const named = (/** @type {any} */ ctx, /** @type {string} */ n) => /** @type {any[][]} */ (ctx.calls.filter((/** @type {unknown[]} */ c) => c[0] === n));
/** Display frames every 16 ms from `from` to `to` (both in ms, `to` included), as a 60 Hz screen gives them; the driver caps one long frame at the run's catch-up (1/15 s). @param {ReturnType<typeof frames>} f @param {number} from @param {number} to */
const play = (f, from, to) => { for (let ms = from + 16; ms < to; ms += 16) f.tick(ms); f.tick(to); };

test("the default key map is the DMG host's: arrows and WASD for the pad, X and K for A, Z and J for B, Enter, Shift", () => {
  assert.deepEqual(DEFAULT_KEYS, {
    ArrowUp: "pad.up", ArrowDown: "pad.down", ArrowLeft: "pad.left", ArrowRight: "pad.right",
    KeyW: "pad.up", KeyS: "pad.down", KeyA: "pad.left", KeyD: "pad.right",
    KeyX: "a", KeyK: "a", KeyZ: "b", KeyJ: "b", Enter: "start", ShiftLeft: "select", ShiftRight: "select",
  });
  // every value is a page control, or one of the pad's directions
  for (const v of Object.values(DEFAULT_KEYS)) assert.ok(Object.hasOwn(PAGE_CONTROLS, v.split(".")[0]), v);
  assert.deepEqual(Object.keys(PAGE_CODES), ["W001", "W002", "W003"]);
  assert.ok(RESERVED_LETTERS.includes("W"), "W is the kit's, so a Dialect's own codes cannot take it");
});

test("each image with a file is decoded once, through the host's decoder, into a source by its carried name", async () => {
  const { decoded, page: p } = await mount();
  assert.equal(decoded.length, 1);
  assert.deepEqual({ ...decoded[0], bytes: decoded[0].bytes.length }, { bytes: 33, name: "level.sheet", path: "art/sheet.png", width: 16, height: 8 });
  assert.deepEqual(p.sources, { "level.sheet": { bitmap: "level.sheet" } });
  assert.deepEqual(p.diagnostics, []);
});

test("the page asks for frames once started, advances the run by each frame's wall time, and draws the shown list each frame", async () => {
  const { page: p, ctx, f } = await mount();
  assert.deepEqual(p.size, { width: 40, height: 32 }, "the shown frame's extent");
  assert.equal(f.waiting, 0, "nothing runs until start");
  p.start();
  assert.equal(f.waiting, 1);
  f.tick(1000);                         // the first frame sets the clock and draws the init picture: the HUD, no board yet
  assert.equal(p.status().seconds, 0);
  assert.deepEqual(named(ctx, "clearRect"), [["clearRect", 0, 0, 40, 32]]);
  assert.ok(named(ctx, "fillText").some((c) => c[1] === "SCORE 0"));
  assert.equal(named(ctx, "drawImage").length, 0, "a Draw input is empty at init");
  play(f, 1000, 1125);                  // the first tick: the board arrives, its tiles drawn from the decoded sheet, cell by cell
  assert.equal(p.status().T, "1/8");
  const blits = named(ctx, "drawImage");
  assert.ok(blits.length > 0);
  assert.deepEqual(blits[0][1], { bitmap: "level.sheet" });
  ctx.calls.length = 0;
  play(f, 1125, 1250);                  // the second: the coin is picked
  assert.equal(p.status().seconds, 0.25);
  assert.ok(named(ctx, "fillText").some((c) => c[1] === "SCORE 1"), "the HUD shows the new score");
  assert.equal(f.waiting, 1, "each frame asks for the next");
  ctx.calls.length = 0;
  f.tick(2250);                         // a frame a second late advances by the catch-up cap only: kit/run's driver slows, it never skips
  assert.equal(p.status().T, "19/60");
  p.stop();
  f.tick(2266);
  assert.equal(f.waiting, 0, "a stopped page asks for no more frames");
  assert.equal(p.status().T, "19/60", "and the run does not move");
});

test("keys are page inputs: a held direction is one pad record per change, a button one per press and release", async () => {
  const { page: p, f } = await mount();
  p.start();
  f.tick(0);
  const key = (/** @type {string} */ type, /** @type {string} */ code) => p.key({ type, code });
  assert.equal(key("keydown", "ArrowRight"), true);
  assert.equal(key("keydown", "ArrowRight"), true, "a key repeat is still the page's");
  assert.equal(key("keydown", "KeyX"), true);
  assert.equal(key("keydown", "KeyK"), true, "a second key for a held button is the page's, and sends nothing");
  assert.equal(key("keydown", "KeyQ"), false, "an unmapped key is not");
  play(f, 0, 160);                      // hero steps at 1/8 and takes the press
  key("keyup", "KeyX");
  key("keyup", "KeyK");
  play(f, 160, 300);
  const s = p.run.state("hero");
  assert.equal(s.x, 1, "the repeat sent no second record");
  assert.equal(s.a, 1, "one press (held: true), then one release (held: false) when the last key for it is up");
  const inputs = p.run.log.inputs.filter((/** @type {any} */ e) => e.part === "page");
  assert.deepEqual(inputs.map((/** @type {any} */ e) => [e.name, e.value]), [
    ["pad", { up: false, down: false, left: false, right: true }],
    ["a", { held: true }],
    ["a", { held: false }],
  ]);
  key("keyup", "ArrowRight");
  assert.deepEqual(p.run.log.inputs.at(-1)?.value, { up: false, down: false, left: false, right: false });
});

test("a host may give its own key map", async () => {
  const { page: p, f } = await mount(undefined, { keys: { KeyL: "pad.right" } });
  p.start();
  f.tick(0);
  assert.equal(p.key({ type: "keydown", code: "ArrowRight" }), false, "the default map is replaced, not merged");
  assert.equal(p.key({ type: "keydown", code: "KeyL" }), true);
  play(f, 0, 250);
  assert.equal(p.run.state("hero").x, 1);
  assert.throws(() => createPage({ ...p.options, keys: { KeyL: "pad.forward" } }), /pad\.forward is not a page control: the controls are pad\.up, pad\.down, pad\.left, pad\.right, a, b, start, select/);
});

test("the draw-time profile check runs where the page draws, and a refusal is a page diagnostic, never silent", async () => {
  // the disc goes through a local, so composition cannot see its kind and leaves it to draw time
  const { page: p, f, ctx } = await mount({ profile: "gameboy", still: true, maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => { const o = { op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" }; return o; }; } });
  p.start();
  f.tick(0);
  assert.equal(p.diagnostics.length, 0, "the init picture is the HUD alone, which the Game Boy draws");
  play(f, 0, 125);                      // the board arrives at the first instant, with its disc
  assert.deepEqual(p.diagnostics.map((d) => d.code), ["W001"]);
  const d = p.diagnostics[0];
  assert.equal(d.severity, "error");
  assert.equal(d.part, "scr");
  assert.equal(d.T, "0", "the instant the shown list was committed at");
  assert.match(d.message, /^the Game Boy \(DMG\) refuses scr\.out\.view at T = 0: .*ellipse/);
  assert.ok(d.check?.some((c) => c.code === "J042"), "the check's own diagnostics ride along");
  assert.ok(named(ctx, "ellipse").length > 0, "the list is drawn as it stands, not trimmed");
  play(f, 125, 400);
  assert.equal(p.diagnostics.length, 1, "the same refusal is reported once while it lasts, not every frame");
  assert.equal(p.status().view?.check?.ok, false);
});

test("a refusal that changes is reported again", async () => {
  // the coin is picked at the first instant, so only the init picture of the maze has a disc: show the maze itself
  const { composed, runtimes, packages } = await bench({ profile: "gameboy", maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => { const o = { op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" }; return o; }; } });
  const f = frames();
  const p = createPage({ composed: { ...composed, show: "level", view: "view" }, runtimes, packages, context: fakeContext(), requestFrame: f.requestFrame });
  await p.ready;
  p.start();
  f.tick(0);
  assert.deepEqual(p.diagnostics.map((x) => x.code), ["W001"], "the init picture: tiles one unit a cell, and the disc");
  play(f, 0, 100);
  assert.equal(p.diagnostics.length, 2, "the disc is gone, and the tiles are still refused: a different refusal");
  assert.doesNotMatch(p.diagnostics[1].message, /ellipse/);
});

test("a shown part with no Draw output is W002, and the page draws nothing", async () => {
  const { composed, runtimes, packages } = await bench();
  const ctx = fakeContext(), f = frames();
  const p = createPage({ composed: { ...composed, show: "hero" }, runtimes, packages, context: ctx, requestFrame: f.requestFrame });
  await p.ready;
  assert.deepEqual(p.diagnostics.map((d) => d.code), ["W002"]);
  assert.match(p.diagnostics[0].message, /the page shows hero, which has no Draw output/);
  p.start();
  f.tick(0);
  assert.equal(named(ctx, "drawImage").length, 0);
  assert.equal(p.size, null);
});

test("an image the page cannot decode is W003, and draws as its box", async () => {
  const failing = await mount(undefined, { decode: async () => { throw new Error("bad bitmap"); } });
  assert.deepEqual(failing.page.diagnostics.map((d) => d.code), ["W003"]);
  assert.match(failing.page.diagnostics[0].message, /level\.sheet \(art\/sheet\.png\) did not decode: bad bitmap/);
  // with no decoder at all, every image draws as its box, and that is not a problem to report
  const none = await mount(undefined, { decode: undefined });
  assert.deepEqual(none.page.sources, {});
  assert.deepEqual(none.page.diagnostics, []);
  // a package that does not carry the file (it was not loaded by kit/package) is W003 too
  const { composed, runtimes } = await bench();
  const p = createPage({ composed, runtimes, packages: [], context: fakeContext(), requestFrame: frames().requestFrame, decode: async () => ({}) });
  await p.ready;
  assert.deepEqual(p.diagnostics.map((d) => d.code), ["W003"]);
  assert.match(p.diagnostics[0].message, /level\.sheet's file art\/sheet\.png is not in a loaded package/);
});

test("status gives what a host UI needs next: the instant, the run's diagnostics, the view; why() is the run's", async () => {
  const { page: p, f } = await mount();
  p.start();
  f.tick(0);
  play(f, 0, 125);
  const s = p.status();
  assert.ok(s.view);
  assert.equal(s.T, "1/8");
  assert.equal(s.seconds, 0.125);
  assert.equal(s.paused, false);
  assert.deepEqual(s.diagnostics, p.run.diagnostics);
  assert.deepEqual(s.page, p.diagnostics);
  assert.equal(s.view.part, "scr");
  assert.equal(s.view.port, "view");
  assert.ok(s.view.ops > 0);
  assert.equal(s.view.check, null, "built without a profile, nothing is checked");
  assert.equal(p.why(), p.run.why());
  p.driver.pause();
  f.tick(500);
  assert.equal(p.status().paused, true);
  assert.equal(p.status().seconds, 0.125, "paused, frames draw but do not advance the run");
});
