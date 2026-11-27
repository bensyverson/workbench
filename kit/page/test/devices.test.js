// Device adapters as pure functions (project/2026-11-27-controls-draft.md, requirement 4; build plan group 43): a
// gamepad's buttons and an axis, MIDI notes and CCs with a channel filter, and H014 when MIDI is absent or refused.
// A synth's notes and filter knob, and a pad's buttons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gamepadRecords, midiRecords, midiAccess } from "../index.js";

const pads = { kind: "buttons", buttons: ["fire", "jump"], gamepad: { fire: 0, jump: 1 } };
const cutoff = { kind: "number", min: 20, max: 20000, value: 1000, curve: "log", gamepad: { axis: 2 }, midi: { cc: 74, channel: 2 } };
const notes = { kind: "triggers", count: 25, first: 48, midi: { notes: true, channel: 1 } };

test("43a. gamepad buttons and an axis", () => {
  const pad = (/** @type {boolean[]} */ pressed, /** @type {number[]} */ axes = []) => ({ buttons: pressed.map((p) => ({ pressed: p })), axes });
  assert.deepEqual(gamepadRecords(pads, pad([true, false]), null), [{ fire: true, jump: false }]);
  assert.deepEqual(gamepadRecords(pads, pad([true, false]), pad([true, false])), [], "no change, no record");
  const lin = { ...cutoff, curve: "linear", min: 0, max: 10 };
  assert.deepEqual(gamepadRecords(lin, pad([], [0, 0, 0]), null), [{ value: 5 }], "an axis from -1..1 scaled to min..max");
  assert.deepEqual(gamepadRecords(lin, pad([], [0, 0, 1]), null), [{ value: 10 }]);
});

test("43b. MIDI note on and off, velocity 0 as off, a CC scaled by curve, and a channel filter", () => {
  assert.deepEqual(midiRecords(notes, [0x90, 60, 127]), [{ index: 60, on: true, velocity: 1 }], "channel 1 is status 0x90");
  assert.deepEqual(midiRecords(notes, [0x80, 60, 64]), [{ index: 60, on: false, velocity: 64 / 127 }]);
  assert.deepEqual(midiRecords(notes, [0x90, 60, 0]), [{ index: 60, on: false, velocity: 0 }], "a note on with velocity 0 is off");
  assert.deepEqual(midiRecords(notes, [0x91, 60, 100]), [], "another channel");
  assert.deepEqual(midiRecords(notes, [0x90, 30, 100]), [], "below first");
  const [hi] = /** @type {any[]} */ (midiRecords(cutoff, [0xb1, 74, 127]));
  assert.ok(Math.abs(hi.value - 20000) < 1e-6);
  const [mid] = /** @type {any[]} */ (midiRecords(cutoff, [0xb1, 74, 63.5]));
  assert.ok(Math.abs(mid.value - Math.sqrt(20 * 20000)) < 1e-6, "log: the middle is the geometric mean");
  assert.deepEqual(midiRecords(cutoff, [0xb1, 75, 127]), [], "another CC");
});

test("43c. H014 when MIDI is absent or refused, and the access when granted", async () => {
  assert.equal((await midiAccess({})).code, "H014");
  assert.equal((await midiAccess({ requestMIDIAccess: async () => { throw new Error("denied"); } })).code, "H014");
  const access = { inputs: new Map() };
  assert.deepEqual(await midiAccess({ requestMIDIAccess: async () => access }), { ok: true, access });
});
