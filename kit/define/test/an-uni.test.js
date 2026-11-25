// Review of 6e4f3a7 (job UypdwY): an() read every uni- word as "you-", so it wrote "a uninitialized". The un-
// prefix before an i-word (uninitialized, unindexed, unimportant) takes "an"; uni- words that sound "you-" keep "a".
import { test } from "node:test";
import assert from "node:assert/strict";
import { an } from "../codes.js";

test("an un- prefix before an i-word takes an", () => {
  for (const w of ["uninitialized", "unindexed", "unimportant", "uninstalled", "unimplemented", "unintended"]) assert.equal(an(w), `an ${w}`);
});

test("uni- words that sound you- keep a", () => {
  for (const w of ["unique", "unit", "uniform", "union", "universe", "unicode", "unified", "unison", "united", "unicorn"]) assert.equal(an(w), `a ${w}`);
});
