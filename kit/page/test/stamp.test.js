// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// A device's own time is an input's stamp (project/2026-11-27-controls-draft.md, requirement 4; build plan group 38):
// `page.stampOf(ms)` maps an event's timeStamp onto T through the driver's last frame, never at or before the last
// instant run, and gives the next instant while paused; a key event with a timeStamp is logged at that stamp.
import { test } from "node:test";
import assert from "node:assert/strict";
import { synthPage } from "../fixtures/controls-bench.js";

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
