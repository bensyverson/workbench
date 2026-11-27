// The worked example the relay's docs teach from (docs/seams.md, docs/runtime.md): the drums and board packages
// and the light-show glue. Every snippet in those docs is cut from these files, so the docs' example is one the
// real kit checks and runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadCompose } from "../checker/load.js";
import { createRun, replay } from "../../../kit/run/index.js";

const EXAMPLE = fileURLToPath(new URL("../fixtures/example/", import.meta.url));

/** The example folder laid out as a compose leg: the glue beside both packages. */
async function example() {
  const r = await loadCompose(EXAMPLE, ["drums", "board"], { glue: "compose/workbench.js" });
  assert.deepEqual(r.diagnostics, []);
  return r;
}

test("the light-show glue checks clean and plans the docs' three wires", async () => {
  const r = await example();
  assert.deepEqual(r.plan, [
    "beat.out.hit → strip.in.flash: pos: drums.step → board.lamp, point, ×2 +0.5 (fit at line 13: [-0.5]..[15.5] in [-0.5]..[31.5]); drops lane",
    "beat.out.tempo → strip.in.drift: (value): drums.step → board.lamp, quantity per second, ×2 (fit at line 13: [-0.5]..[15.5] in [-0.5]..[31.5])",
    "strip.out.full → beat.in.mute: unchanged; delayed",
  ]);
});

test("the light-show runs headless: each hit lights the lamps under its step, and replay matches", async () => {
  const r = await example();
  const runtimes = r.loaded.map((p) => p.runtime);
  const composed = r.composition.build({ ...r.options, runtimes });
  const packages = r.loaded.map((p) => ({ name: p.name, content: p.content }));
  const run = createRun(composed, { runtimes, packages });
  run.runUntil(0.6);
  assert.deepEqual(run.diagnostics, []);
  // the kick on step 4 (T = 0.5) lands on lamp 2 × 4 + 0.5 = 8.5, rounded to 9 (Math.round), at strength 1
  const levels = run.state("strip").levels;
  assert.ok(levels[9] > 0.5, String(levels));
  assert.equal(run.state("strip").shift > 0, true);
  const again = replay(composed, { runtimes, packages }, JSON.parse(JSON.stringify(run.record())));
  assert.equal(again.ok, true);
});

test("every code line of the docs' examples is a line of the example's files", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const DOCS = fileURLToPath(new URL("../docs/", import.meta.url));
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".js")) files.push(p); } };
  walk(EXAMPLE);
  const strip = (/** @type {string} */ l) => l.replace(/\s+\/\/ .*$/, "").trim();
  const have = new Set(files.flatMap((f) => readFileSync(f, "utf8").split("\n").map(strip)));
  /** @type {string[]} */
  const missing = [];
  for (const doc of ["seams.md", "runtime.md"]) {
    const blocks = [...readFileSync(join(DOCS, doc), "utf8").matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
    for (const line of blocks.flatMap((b) => b.split("\n")).map(strip)) {
      if (line === "" || line.startsWith("//") || line.includes("…")) continue;
      if (!have.has(line)) missing.push(`${doc}: ${line}`);
    }
  }
  assert.deepEqual(missing, []);
});
