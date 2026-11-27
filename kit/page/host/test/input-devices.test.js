// @ts-nocheck: a stand-in navigator and generated page objects, which TypeScript cannot follow here.
// The host's device inputs (input-devices.js), with stub navigator objects and no DOM: a gamepad polled per frame, MIDI
// listened to after the gesture, each stamped with the device's time and only for Controls that declare the device.
// The primary target is a synth with MIDI note triggers and knobs (a number Control by CC); a game's pad is the other leg.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInputDevices } from "../input-devices.js";
import { createSession } from "../session.js";
import { fakeContext, frames } from "../../fixtures/bench.js";
import { synthKit } from "../../fixtures/controls-bench.js";

const loadedOf = (k) => ({ composed: k.composed, runtimes: k.runtimes, packages: k.packages.map((p) => ({ name: p.name, loaded: { ui: p.ui } })), rebuild: null, diagnostics: [] });

/** The synth: MIDI notes 60..63 on channel 1, a cutoff knob on CC 74 (log), a tempo on a pad's axis 0, buttons on pad buttons. */
const SYNTH = {
  notes: { kind: "triggers", count: 4, first: 60, midi: { notes: true, channel: 1 } },
  cutoff: { kind: "number", min: 20, max: 20000, value: 1000, curve: "log", midi: { cc: 74 } },
  tempo: { kind: "number", min: 40, max: 240, value: 120, gamepad: { axis: 0 } },
  pads: { kind: "buttons", buttons: ["hold", "latch"], gamepad: { hold: 0, latch: 1 } },
  mute: { kind: "toggle", value: false, keys: ["KeyM"] },
};

/** A synth page on the given Controls, with the devices wired to it. */
function rig(controls, navigator, extra = {}) {
  const k = synthKit(controls);
  const f = frames();
  const s = createSession(loadedOf(k), { context: fakeContext(), requestFrame: f.requestFrame });
  s.page.unlock(); s.start(); f.tick(1000); f.tick(1016);
  const reports = [];
  const poll = frames();
  const d = createInputDevices({ forms: () => s.forms(), control: (n, r, e) => s.control(n, r, e), navigator, requestFrame: poll.requestFrame, report: (x) => reports.push(x), ...extra });
  return { s, f, d, reports, poll };
}
const secs = (e) => { const [n, den = "1"] = String(e.T).split("/"); return Number(n) / Number(den); };
const inputs = (s) => s.page.run.log.inputs.filter((e) => e.kind === "control").map((e) => [e.name, e.value]);
const ON = (note, vel, ch = 0) => [0x90 | ch, note, vel], OFF = (note, ch = 0) => [0x80 | ch, note, 0];
/** A MIDI access stub with one input, and a way to send a message through it. */
const midiStub = () => { const input = {}; const access = { inputs: new Map([["a", input]]), onstatechange: null }; return { input, access, navigator: { requestMIDIAccess: async () => access } }; };

test("a synth's MIDI notes play its trigger Control, stamped with the message's time, after the gesture", async () => {
  const m = midiStub();
  const { s, d } = rig({ notes: SYNTH.notes, tempo: { kind: "number", min: 40, max: 240, value: 120 } }, m.navigator);
  assert.equal(m.input.onmidimessage, undefined, "nothing listens before the gesture");
  await d.listen();
  assert.equal(typeof m.input.onmidimessage, "function");
  m.input.onmidimessage({ data: ON(62, 127), timeStamp: 1020 });
  m.input.onmidimessage({ data: ON(62, 0), timeStamp: 1030 });
  m.input.onmidimessage({ data: ON(99, 90), timeStamp: 1031 });
  m.input.onmidimessage({ data: ON(61, 90, 1), timeStamp: 1032 });
  const log = s.page.run.log.inputs.filter((e) => e.kind === "control");
  assert.deepEqual(log.map((e) => e.value), [{ index: 62, on: true, velocity: 1 }, { index: 62, on: false, velocity: 0 }], "a note outside the range and one on channel 2 play nothing");
  // the last frame was at 1016 ms; a message at 1020 ms is 4 ms after the run's T there, one at 1030 is 14 ms after
  assert.ok(Math.abs(secs(log[0]) - (s.page.run.seconds + 0.004)) < 1e-9, `stamped from the message's time: ${log[0].T}`);
  assert.ok(Math.abs(secs(log[1]) - (s.page.run.seconds + 0.014)) < 1e-9, `and the next from its own: ${log[1].T}`);
});

test("a knob (a number Control by CC) is scaled by its curve; a Control that declares no MIDI hears none", async () => {
  const m = midiStub();
  const { s, d } = rig({ notes: SYNTH.notes, tempo: { kind: "number", min: 20, max: 20000, value: 1000, curve: "log", midi: { cc: 74 } }, mute: SYNTH.mute }, m.navigator);
  await d.listen();
  m.input.onmidimessage({ data: [0xb0, 74, 127], timeStamp: 1020 });
  m.input.onmidimessage({ data: [0xb0, 75, 127], timeStamp: 1021 });
  m.input.onmidimessage({ data: ON(60, 100), timeStamp: 1022 });
  assert.deepEqual(inputs(s).map(([n]) => n), ["tempo", "notes"]);
  assert.ok(Math.abs(inputs(s)[0][1].value - 20000) < 1e-6);
});

test("no Control declares MIDI: access is never requested; a refused request is one H014", async () => {
  let asked = 0;
  const none = rig({ notes: { kind: "triggers", count: 4, first: 60, keys: ["KeyA", "KeyS", "KeyD", "KeyF"] } }, { requestMIDIAccess: async () => { asked++; } });
  await none.d.listen();
  assert.equal(asked, 0);
  const refused = rig({ notes: SYNTH.notes, tempo: SYNTH.tempo }, { requestMIDIAccess: async () => { throw new Error("denied"); }, getGamepads: () => [] });
  await refused.d.listen(); await refused.d.listen();
  assert.equal(refused.reports.length, 1);
  assert.equal(refused.reports[0].code, "H014");
  assert.match(refused.reports[0].message, /denied/);
  assert.equal(rig({ notes: SYNTH.notes, tempo: SYNTH.tempo }, {}).d.listen() instanceof Promise, true);
});

test("a missing navigator MIDI is H014 once", async () => {
  const r = rig({ notes: SYNTH.notes, tempo: SYNTH.tempo }, {});
  await r.d.listen();
  assert.deepEqual(r.reports.map((x) => x.code), ["H014"]);
});

test("MIDI inputs plugged in later are listened to", async () => {
  const m = midiStub();
  const { d } = rig({ notes: SYNTH.notes, tempo: SYNTH.tempo }, m.navigator);
  await d.listen();
  const late = {};
  m.access.inputs.set("b", late);
  m.access.onstatechange();
  assert.equal(typeof late.onmidimessage, "function");
});

/** A pad stub: buttons by pressed flags, axes, the browser's own timestamp. */
const pad = (pressed, axes, timestamp, index = 0) => ({ index, connected: true, timestamp, buttons: pressed.map((p) => ({ pressed: p })), axes });

test("a gamepad is polled once per frame; a record is made only on a change, stamped with the pad's time", () => {
  let now = pad([false, false], [0], 1020);
  const { s, d, poll } = rig({ pads: SYNTH.pads, tempo: SYNTH.tempo }, { getGamepads: () => [null, now] });
  d.start();
  assert.equal(poll.waiting, 1, "one frame request, not one per Control");
  poll.tick(0);
  assert.deepEqual(inputs(s).map(([n]) => n), ["pads", "tempo"], "the first poll reads the pad's state");
  const at = s.page.run.seconds;
  const stamps = () => s.page.run.log.inputs.filter((e) => e.kind === "control").map(secs);
  assert.ok(stamps().every((t) => Math.abs(t - (at + 0.004)) < 1e-9), "stamped from the pad's timestamp (1020 ms, the last frame at 1016)");
  poll.tick(16);
  assert.equal(inputs(s).length, 2, "an unchanged pad makes nothing");
  now = pad([true, false], [1], 1030);
  poll.tick(32);
  assert.deepEqual(inputs(s).slice(2), [["pads", { hold: true, latch: false }], ["tempo", { value: 240 }]]);
  assert.ok(stamps().slice(2).every((t) => Math.abs(t - (at + 0.014)) < 1e-9), "the change is stamped from its own timestamp");
  d.stop();
  poll.tick(48);
  assert.equal(poll.waiting, 0, "stop ends the polling");
});

test("no Control declares a gamepad: nothing is polled; a locked page plays no device", () => {
  const a = rig({ notes: SYNTH.notes, tempo: { kind: "number", min: 0, max: 1, value: 0, midi: { cc: 1 } } }, { getGamepads: () => { throw new Error("must not poll"); } });
  a.d.start();
  assert.equal(a.poll.waiting, 0);
  let locked = true;
  const b = rig({ pads: SYNTH.pads, tempo: SYNTH.tempo }, { getGamepads: () => [pad([true, true], [1], 5)] }, { locked: () => locked });
  b.d.poll();
  assert.equal(inputs(b.s).length, 0);
  locked = false;
  b.d.poll();
  assert.equal(inputs(b.s).length, 2);
});

test("a locked page plays no MIDI; a keyed Control is never played by a device; a refusal is said once; a disconnected pad is skipped", async () => {
  const sent = [], reports = [];
  const forms = [{ name: "k", kind: "triggers", count: 4, first: 60, midi: { notes: true }, keyed: true }, { name: "n", kind: "triggers", count: 4, first: 60, midi: { notes: true } }, { name: "t", kind: "number", min: 0, max: 1, value: 0, gamepad: { axis: 0 } }];
  let locked = true, last;
  const d = createInputDevices({ forms: () => forms, control: (n, r) => { sent.push(n); last = r; return [{ code: "N012", message: "does not fit" }]; }, navigator: { getGamepads: () => [{ index: 0, connected: false, axes: [1], buttons: [], timestamp: 1 }, { index: 1, connected: true, axes: [-1], buttons: [], timestamp: 2 }] }, requestFrame: () => {}, report: (x) => reports.push(x), locked: () => locked });
  d.message(ON(60, 100), 5);
  assert.deepEqual(sent, [], "locked");
  locked = false;
  d.message(ON(60, 100), 5); d.message(ON(61, 100), 6);
  assert.deepEqual(sent, ["n", "n"], "the keyed one hears nothing");
  assert.equal(reports.length, 1, "one refusal said once");
  assert.deepEqual([reports[0].code, reports[0].severity], ["N012", "error"]);
  d.poll();
  assert.deepEqual(sent.slice(2), ["t"], "the connected pad plays, the disconnected one is skipped");
  assert.deepEqual(last, { value: 0 }, "from the connected pad's axis (-1), not the disconnected one's (1)");
});

test("MIDI access is asked for once, however often the gesture is reported", async () => {
  let asked = 0;
  const access = { inputs: new Map(), onstatechange: null };
  const { d } = rig({ notes: SYNTH.notes, tempo: { kind: "number", min: 40, max: 240, value: 120 } }, { requestMIDIAccess: async () => { asked++; return access; } });
  await d.listen(); await d.listen();
  assert.equal(asked, 1);
});
