// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// A device's own time is an input's stamp (project/2026-11-27-controls-draft.md, requirement 4; build plan group 38):
// `page.stampOf(ms)` maps an event's timeStamp onto T through the driver's last frame, never at or before the last
// instant run, and gives the next instant while paused; a key event with a timeStamp is logged at that stamp.
import { test } from "node:test";
import assert from "node:assert/strict";
import { synthPage, logged } from "../fixtures/controls-bench.js";

/** A logged stamp, "n/d" or a number, in seconds. @param {unknown} t */
const seconds = (t) => { const [n, d = "1"] = String(t).split("/"); return Number(n) / Number(d); };

test("38. stampOf maps a device time between frames into T, clamps after the last instant, and while paused gives the next instant", () => {
  const { page: pg, f } = synthPage();
  pg.unlock();
  pg.start();
  f.tick(1000); f.tick(1016); f.tick(1032);
  const at = pg.run.seconds;
  assert.ok(at > 0);
  assert.ok(Math.abs(pg.stampOf(1040) - (at + 0.008)) < 1e-9, `between frames: ${pg.stampOf(1040)} for ${at}`);
  assert.ok(pg.stampOf(900) > at, "an event older than the last instant is stamped just after it");
  assert.ok(pg.stampOf(900) <= at + 0.001 + 1e-9);
  pg.key({ type: "keydown", code: "KeyA", timeStamp: 1040 });
  const [entry] = pg.run.log.inputs.filter((e) => e.kind === "control");
  assert.ok(Math.abs(seconds(entry.T) - (at + 0.008)) < 1e-9, `the key's stamp is its device time: ${entry.T}`);
  pg.driver.pause();
  const paused = pg.stampOf(5000);
  assert.ok(paused > pg.run.seconds, "paused: after the last instant");
  assert.equal(pg.stampOf(9000), paused, "paused: the next instant, whatever the wall says");
});

test("38. a page input is never stamped before the latest stamp the page logged: blur's release follows a device-stamped press", () => {
  const { page: pg, f } = synthPage();
  pg.unlock();
  pg.start();
  f.tick(1000); f.tick(1016); f.tick(1032);
  const at = pg.run.seconds;
  pg.key({ type: "keydown", code: "KeyH", timeStamp: 1052 }); // 20 ms after the last frame: the next frame is late
  pg.blur();
  const order = pg.run.log.inputs.filter((e) => e.kind === "control");
  assert.deepEqual(order.map((e) => e.value), [{ hold: true, latch: false }, { hold: false, latch: false }], "the press, then the release");
  assert.ok(seconds(order[1].T) >= seconds(order[0].T), `the release at ${order[1].T} is not before the press at ${order[0].T}`);
  assert.ok(Math.abs(seconds(order[0].T) - (at + 0.02)) < 1e-9, "the press keeps its device time");
  f.tick(1066); f.tick(1082);
  assert.deepEqual(logged(pg).at(-1)[1], { hold: false, latch: false });
});

test("38. a device time past the following frame is clamped to it, so a late frame cannot put a key's up before its down", () => {
  const { page: pg, f } = synthPage();
  pg.unlock();
  pg.start();
  f.tick(1000); f.tick(1016);
  const at = pg.run.seconds;
  const most = at + Number(pg.run.catchUp.n) / Number(pg.run.catchUp.d);
  pg.key({ type: "keydown", code: "KeyH", timeStamp: 1400 }); // the frame callback was 400 ms late
  f.tick(1416); // a long frame, which the driver caps
  pg.key({ type: "keyup", code: "KeyH", timeStamp: 1420 });
  const order = pg.run.log.inputs.filter((e) => e.kind === "control");
  assert.deepEqual(order.map((e) => e.value.hold), [true, false]);
  assert.ok(seconds(order[0].T) <= most + 1e-9, `the press at ${order[0].T} is within the following frame (by ${most})`);
  assert.ok(seconds(order[1].T) >= seconds(order[0].T));
  assert.deepEqual(logged(pg).at(-1)[1], { hold: false, latch: false });
  // still: a stamp between two frames maps to its device time
  const now = pg.run.seconds;
  assert.ok(Math.abs(pg.stampOf(1426) - (now + 0.01)) <= 0.0005 + 1e-9, `${pg.stampOf(1426)} for ${now}`);
});

test("38. after a rewind, a page input is stamped from where the run now is, not after the inputs the rewind undid", () => {
  const { page: pg, f } = synthPage();
  pg.unlock();
  pg.start();
  f.tick(1000); f.tick(1016); f.tick(1032); f.tick(1048); f.tick(1064);
  pg.key({ type: "keydown", code: "KeyH", timeStamp: 1070 });
  f.tick(1080); f.tick(1096);
  pg.run.rewind(0.02);
  pg.driver.pause();
  const T = pg.stampOf(2000);
  assert.ok(T <= 0.02 + 0.001 + 1e-9, `the next instant after the rewound T, not after the undone press: ${T}`);
});

test("Fws2zJ. a rewind to exactly the T the page last looked at drops a stamp set ahead of it, so the next input is stamped from T", () => {
  const { page: pg, f } = synthPage();
  pg.unlock();
  pg.start();
  for (let ms = 1000; ms <= 1200; ms += 16) f.tick(ms);
  pg.key({ type: "keydown", code: "KeyH", timeStamp: 1260 }); // stamped ahead of T
  const T0 = pg.run.seconds;
  pg.run.rewind(T0);
  pg.key({ type: "keyup", code: "KeyH" });
  const stamps = pg.run.log.inputs.filter((e) => e.kind === "control").map((e) => seconds(e.T));
  assert.equal(stamps.length, 1, "the press stamped ahead was dropped by the rewind");
  assert.ok(stamps[0] <= T0 + 0.002, `the release is stamped right after T, not after the dropped press: ${stamps[0]} for ${T0}`);
  // what must still hold: a stamp that survives keeps its order
  pg.key({ type: "keydown", code: "KeyH", timeStamp: 1260 });
  pg.key({ type: "keyup", code: "KeyH" });
  const after = pg.run.log.inputs.filter((e) => e.kind === "control").map((e) => seconds(e.T));
  assert.deepEqual(after, [...after].sort((a, b) => a - b), "inputs stay in order");
});
