// The Draw build's acceptance (leaf GCy994): the recorded compose leg's hand-ins (its maze, particles and arcade
// packages and its glue), massaged to the 2026-11-26 rulings as scripts/draw-trial/README.md lists, compose and
// run on the real kit, with no stand-in for Draw. The burst is drawn over the maze in the shown list, the list draws
// on Canvas, and the Game Boy refuses it at composition by op kind (S401) and at draw time (J042), since these
// packages draw with rects and ellipses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadCompose } from "../../seams-trial/checker/load.js";
import { steerToCoin } from "../../seams-trial/checker/runs.js";
import { installHooks } from "../../ui-trial/checker/hooks.js";
import { createRun, pageView } from "../../../kit/run/index.js";
import { drawCanvas, checkDraw, CANVAS, GAMEBOY } from "../../../kit/draw/index.js";

const LEG = fileURLToPath(new URL("../massaged/2026-11-26-compose", import.meta.url));

test("the massaged compose leg composes, runs, and draws the burst over the maze on Canvas", async () => {
  installHooks();
  const r = await loadCompose(LEG, ["maze", "particles", "arcade"]);
  assert.deepEqual(r.diagnostics, []);
  const runtimes = r.loaded.map((p) => p.runtime);
  const options = { ...r.options, runtimes };
  assert.deepEqual(r.composition.check(options).filter((/** @type {any} */ d) => d.severity === "error"), []);
  assert.match(r.plan.join("\n"), /dungeon\.out\.view → screen\.in\.board: \(value\): maze\.pixel → arcade\.screen, draw/);

  const composed = r.composition.build(options);
  assert.equal(composed.view, "view");
  const run = createRun(composed, { runtimes });
  const grid = composed.parts.find((/** @type {any} */ p) => p.name === "dungeon").record.grid;
  const got = steerToCoin(run, "dungeon", grid, 30);
  assert.ok("T" in got, JSON.stringify(got));
  run.runUntil(/** @type {any} */ (got).T + 0.2);
  assert.deepEqual(run.diagnostics.filter((/** @type {any} */ d) => d.severity === "error"), []);

  const v = pageView(run, composed, runtimes);
  assert.equal(v.part, "screen");
  const kinds = v.list.map((op) => op.op);
  // a backdrop, the maze's floor and walls and discs, the burst's ellipses over them, then three lines of HUD
  assert.equal(kinds[0], "rect");
  assert.deepEqual(kinds.slice(-3), ["text", "text", "text"]);
  const sparks = v.list.filter((op) => op.op === "ellipse" && op.fill !== "#ffd23fff" && op.fill !== "#ff5d73ff");
  assert.ok(sparks.length >= 20, `${sparks.length} burst particles in the shown list`);
  assert.match(v.list.at(-2)?.str ?? "", /^SCORE [1-9]/);

  /** @type {string[]} */
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => () => calls.push(String(k)), set: () => true });
  drawCanvas(/** @type {any} */ (ctx), /** @type {any} */ (v.list), { images: v.images });
  assert.ok(calls.filter((c) => c === "ellipse").length >= sparks.length);
  assert.deepEqual(checkDraw(CANVAS, /** @type {any} */ (v.list), { images: v.images, box: /** @type {any} */ (v.box) }).diagnostics, []);

  // the Game Boy: refused by kind at composition, and so at draw time
  const gb = r.composition.check({ ...options, profile: GAMEBOY }).filter((/** @type {any} */ d) => d.code === "S401");
  assert.equal(gb.length, 1);
  assert.match(gb[0].message, /screen\.out\.view can hold rect, from screen\.out\.view and dungeon\.out\.view; ellipse, from dungeon\.out\.view and sparks\.out\.view/);
  const drawn = checkDraw(GAMEBOY, /** @type {any} */ (v.list), { images: v.images, box: /** @type {any} */ (v.box) });
  assert.ok(drawn.diagnostics.length > 0 && drawn.diagnostics.every((d) => d.code === "J042"));
});
