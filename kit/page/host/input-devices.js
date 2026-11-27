// The page's device inputs (project/2026-11-27-controls-draft.md, requirement 4, "device adapters"): a gamepad polled
// once per animation frame and Web MIDI listened to after the page's one gesture, each turned into Control records
// with the device's own time, only for Controls that declare the device (`gamepad`, `midi`). The adapters that read the
// state and the messages are kit/page's devices.js; this module holds the polling, the previous state and the
// listeners, over a `navigator` and a frame source the host passes, so it runs under Node with stubs.

import { gamepadRecords, midiRecords, midiAccess } from "../devices.js";

/**
 * @typedef {object} InputDeviceOptions
 * @property {() => Array<Record<string, any>>} forms  the page's Controls with their declarations spread over them (`session.forms()`)
 * @property {(name: string, record: Record<string, unknown>, event: { timeStamp: number }) => Array<{ code: string, message: string }>} control  `session.control`
 * @property {any} navigator  `getGamepads()` and `requestMIDIAccess()`, either may be absent
 * @property {(callback: (ms: number) => void) => unknown} requestFrame
 * @property {(diagnostic: { code: string, severity: string, message: string }) => void} report  where H014 and a refused record go
 * @property {() => boolean} [locked]  true while the page waits for its gesture: no device plays until it is over
 */

/** A pad's state as it was, since some browsers hand out one live object. @param {any} pad */
const snapshot = (pad) => ({ buttons: Array.from(pad.buttons ?? [], (/** @type {any} */ b) => ({ pressed: !!b?.pressed })), axes: Array.from(pad.axes ?? []) });

/** @param {Record<string, any>} f  a form: a device only plays a Control that is not keyed and declares it */
const plays = (f, /** @type {"gamepad" | "midi"} */ device) => !f.keyed && f[device] !== undefined;

/** @param {InputDeviceOptions} o */
export function createInputDevices(o) {
  /** Each pad's last state, by its index. @type {Map<number, ReturnType<typeof snapshot>>} */
  const previous = new Map();
  /** The H014 already said, so one refusal is one diagnostic. @type {Set<string>} */
  const said = new Set();
  let running = false, listening = false;
  /** @param {{ code: string, severity: string, message: string }} d */
  const once = (d) => { const k = `${d.code} ${d.message}`; if (!said.has(k)) { said.add(k); o.report({ code: d.code, severity: d.severity, message: d.message }); } };
  /** @param {string} name @param {Record<string, unknown>} record @param {number} timeStamp */
  const send = (name, record, timeStamp) => {
    let refused;
    try { refused = o.control(name, record, { timeStamp }); } catch (e) { once({ code: "H014", severity: "warning", message: `a device record for Control ${name} was dropped: ${e instanceof Error ? e.message : e}` }); return; }
    for (const d of refused) once({ code: d.code, severity: "error", message: d.message });
  };

  /** One gamepad poll: each Control that declares a gamepad gets the records the first connected pad makes against its last state. */
  function poll() {
    if (o.locked?.()) return;
    const pads = typeof o.navigator?.getGamepads === "function" ? Array.from(o.navigator.getGamepads() ?? []).filter((/** @type {any} */ p) => p?.connected !== false && p) : [];
    const pad = /** @type {any} */ (pads[0]);
    if (!pad) return;
    const prev = previous.get(pad.index) ?? null;
    const stamp = typeof pad.timestamp === "number" ? pad.timestamp : 0;
    for (const f of o.forms()) if (plays(f, "gamepad")) for (const r of gamepadRecords(f, pad, prev)) send(f.name, r, stamp);
    previous.set(pad.index, snapshot(pad));
  }

  /** @param {ArrayLike<number>} data @param {number} timeStamp */
  function message(data, timeStamp) {
    if (o.locked?.()) return;
    for (const f of o.forms()) if (plays(f, "midi")) for (const r of midiRecords(f, data)) send(f.name, r, timeStamp);
  }

  /** Starts the per-frame gamepad poll, when some Control declares a pad. */
  function start() {
    if (running || !o.forms().some((f) => plays(f, "gamepad"))) return;
    running = true;
    const tick = () => { if (!running) return; poll(); o.requestFrame(tick); };
    o.requestFrame(tick);
  }

  /**
   * Asks for MIDI (once, from the page's unlock) when some Control declares it, and listens to every input, those
   * plugged in later too. Refused or absent is H014, and the other devices still play.
   */
  async function listen() {
    if (listening || !o.forms().some((f) => plays(f, "midi"))) return;
    listening = true;
    const r = await midiAccess(o.navigator);
    if (!r.ok) { once({ code: String(r.code), severity: String(r.severity), message: String(r.message) }); return; }
    const access = /** @type {any} */ (r.access);
    /** @type {Set<any>} */
    const bound = new Set();
    const bind = () => { for (const input of access.inputs?.values?.() ?? []) if (!bound.has(input)) { bound.add(input); input.onmidimessage = (/** @type {any} */ e) => message(e.data, e.timeStamp); } };
    bind();
    access.onstatechange = bind;
  }

  return { start, stop() { running = false; }, listen, poll, message };
}
