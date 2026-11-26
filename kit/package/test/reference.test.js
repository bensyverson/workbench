// A package's generated reference, the part a composer reads to decide what to wire without running code (the
// seams draft's question 7): each port with its seam, note, default or required, and delivery; each frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { packageReference } from "../index.js";
import { defineDialect } from "../../define/index.js";
import { mazeDecl, particlesDecl } from "../../define/fixtures/seams-dialects.js";

test("a package's reference prints its outputs, inputs and frames", () => {
  const maze = packageReference({ name: "maze", version: "0.2.0", dialect: defineDialect(/** @type {any} */ (mazeDecl())) });
  assert.match(maze, /^# maze 0\.2\.0$/m);
  assert.match(maze, /^## Outputs$/m);
  assert.match(maze, /^- `picked`: `Event<\{ at: point2@cell \}>`: a coin the player picked up during this tick, at its cell; empty most ticks\. Its runtime pushes the records each step\.$/m);
  assert.match(maze, /^- `score`: `f64`: coins picked up so far\.$/m);
  assert.match(maze, /^## Frames$/m);
  assert.match(maze, /^- `cell`: 2 dims, with an extent \("fit" can use it\): grid cells; x right, y down; \(0, 0\) is the center of the top-left cell\.$/m);
  assert.doesNotMatch(maze, /^## Inputs$/m);

  const d = particlesDecl();
  d.ports.in.aim = { seam: "point2@px", required: true, note: "where bursts aim" };
  d.ports.in.burst.delivery = { keepLast: 4 };
  const fx = packageReference({ name: "particles", version: "0.3.0", dialect: defineDialect(/** @type {any} */ (d)) });
  assert.match(fx, /^- `burst`: `Event<\{ at: point2@px \}>`, delivery \{ keepLast: 4 \}, its record read as `ev` in spawn lambdas: fires every emitter/m);
  assert.match(fx, /^- `radius`: `f64@px`, default 40: how far a burst spreads, in pixels\.$/m);
  assert.match(fx, /^- `aim`: `point2@px`, required: where bursts aim\.$/m);
  assert.match(fx, /^- `px`: 2 dims, with an extent/m);
  assert.match(fx, /the kit's `s`/);
  assert.match(fx, /`vec2@<frame>\/s`/, "the rate is spelled with a placeholder, not a name to copy");
  assert.doesNotMatch(fx, /such as `vec2@px\/s`/);
});

test("a Dialect with no seams says so", () => {
  const d = mazeDecl();
  for (const k of ["ports", "frames"]) delete d[k];
  assert.match(packageReference({ name: "maze", version: "0.1.0", dialect: defineDialect(/** @type {any} */ (d)) }), /No ports or frames: nothing can be wired to this package\./);
});
