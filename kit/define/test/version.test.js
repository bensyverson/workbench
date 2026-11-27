// The Definition API's version, which a package's manifest names in `kit` (kit/package checks it at load).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KIT_VERSION } from "../index.js";
import { KIT_VERSION as direct } from "../version.js";

test("KIT_VERSION is major.minor, exported from the index", () => {
  // 0.5 since declared Controls (2026-11-27): a UI with inputs, and a manifest with elements, no longer load
  assert.equal(KIT_VERSION, "0.5");
  assert.equal(direct, KIT_VERSION);
  assert.match(KIT_VERSION, /^\d+\.\d+$/);
});
