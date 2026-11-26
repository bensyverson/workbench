// The placeholder packet (leaf KTrmEL): docs-placeholder/ holds docs/'s rules and prose with every snippet written in
// angle-bracket placeholders and no worked domain example, so a relay can test whether the worked example colors the
// names agents choose. Its other files are docs/'s, unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TRIAL = fileURLToPath(new URL("../", import.meta.url));
const DOCS = join(TRIAL, "docs");
const PLACEHOLDER = join(TRIAL, "docs-placeholder");

/** The names the worked example (drums, board) and runtime.md's particles sample choose: none may reach the placeholder docs. */
const CHOSEN = [
  "drums", "board", "beat", "strip", "hit", "flash", "pos", "strength", "light-show", "lamp", "lamps", "Lamp", "glow",
  "loud", "lane", "tempo", "drift", "fade", "accent", "kick", "snare", "mute", "playing", "levels", "lit", "cm", "big",
  "fx", "fall", "wind", "bounds", "maxParticles", "forces", "emitter", "ball", "player", "counters", "kill", "px",
];

/** The chosen names a file holds, as whole words. @param {string} text */
function chosenNames(text) {
  return CHOSEN.filter((name) => new RegExp(`(?<![\\w-])${name.replace("-", "\\-")}(?![\\w-])`).test(text));
}

const read = (/** @type {string} */ dir, /** @type {string} */ f) => readFileSync(join(dir, f), "utf8");

test("the scanner finds the worked example's names in docs/, so a clean result below means something", () => {
  assert.ok(chosenNames(read(DOCS, "seams.md")).length >= 10, chosenNames(read(DOCS, "seams.md")).join(", "));
  assert.ok(chosenNames(read(DOCS, "runtime.md")).includes("fx"));
});

test("the placeholder seams.md and runtime.md hold none of the worked example's chosen names", () => {
  for (const f of ["seams.md", "runtime.md"]) assert.deepEqual(chosenNames(read(PLACEHOLDER, f)), [], f);
});

test("the placeholder docs keep the kit's literal keys, handles and seam spellings", () => {
  const seams = read(PLACEHOLDER, "seams.md");
  for (const literal of ["seam:", "note:", "from:", "delivery:", "record: { name:", "{ rename: {", "{ delay: true }", ".frame.", ".out.", ".in.", "point1@", "Event<{", "edges: () =>", "extent: (record) =>", "inputs: { object:", "compose(\"<name>\")", "S202"]) {
    assert.ok(seams.includes(literal), literal);
  }
  const runtime = read(PLACEHOLDER, "runtime.md");
  for (const literal of ["defineRuntime(", "clock:", "init:", "step(state, {", "events: { in: {", "events: { out: {", "globals.", "kernels.", "#2"]) {
    assert.ok(runtime.includes(literal), literal);
  }
});

test("the placeholder packet's other files are docs/'s, unchanged", () => {
  for (const f of ["packaging.md", "rules.md", "task-maze.md", "task-particles.md", "task-compose.md"]) {
    assert.equal(read(PLACEHOLDER, f), read(DOCS, f), f);
  }
});
