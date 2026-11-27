// Device adapters as pure functions (project/2026-11-27-controls-draft.md, requirement 4): a Control's kind is
// device-free, and its declaration gives each adapter its defaults. A gamepad's buttons and an axis (the browser's
// standard layout), MIDI note on and off and a CC (velocity / 127; a note on with velocity 0 is off; a CC scaled to
// min..max by the Control's curve), and MIDI access, refused or absent as H014. The host polls and listens.

/** @param {any} pad @param {number} i */
const pressed = (pad, i) => !!pad?.buttons?.[i]?.pressed;

/** A fraction from 0 to 1 onto min..max by the curve. @param {number} f @param {Record<string, any>} d */
const scaled = (f, d) => (d.curve === "log" ? d.min * (d.max / d.min) ** f : d.min + f * (d.max - d.min));

/**
 * The records a gamepad's state makes for one Control, against its previous state (null at first): a buttons
 * Control's whole record when a mapped button changed, a number's value from its axis when it moved.
 * @param {Record<string, any>} decl  the Control's declaration @param {any} pad  a Gamepad @param {any} prev
 * @returns {Array<Record<string, unknown>>}
 */
export function gamepadRecords(decl, pad, prev) {
  const map = decl.gamepad;
  if (!map) return [];
  if (decl.kind === "buttons") {
    const changed = Object.values(/** @type {Record<string, number>} */ (map)).some((i) => !prev || pressed(pad, i) !== pressed(prev, i));
    if (!changed) return [];
    return [Object.fromEntries(decl.buttons.map((/** @type {string} */ b) => [b, map[b] === undefined ? false : pressed(pad, map[b])]))];
  }
  if (decl.kind === "number" && typeof map.axis === "number") {
    const a = Number(pad?.axes?.[map.axis] ?? 0);
    if (prev && Number(prev.axes?.[map.axis] ?? 0) === a) return [];
    return [{ value: scaled((Math.max(-1, Math.min(1, a)) + 1) / 2, decl) }];
  }
  return [];
}

/**
 * The records one MIDI message makes for one Control: a triggers Control's note on or off (on its channel, from
 * `first`), a number's CC scaled by its curve. A channel the declaration names filters; none takes every channel.
 * @param {Record<string, any>} decl @param {ArrayLike<number>} bytes  a MIDI message's data
 * @returns {Array<Record<string, unknown>>}
 */
export function midiRecords(decl, bytes) {
  const m = decl.midi;
  if (!m || bytes.length < 3) return [];
  const status = bytes[0] & 0xf0, channel = (bytes[0] & 0x0f) + 1;
  if (m.channel !== undefined && m.channel !== channel) return [];
  if (decl.kind === "triggers" && m.notes) {
    if (status !== 0x90 && status !== 0x80) return [];
    const first = decl.first ?? 0, note = bytes[1];
    if (note < first || note >= first + decl.count) return [];
    const on = status === 0x90 && bytes[2] > 0;
    return [{ index: note, on, velocity: bytes[2] / 127 }];
  }
  if (decl.kind === "number" && typeof m.cc === "number") {
    if (status !== 0xb0 || bytes[1] !== m.cc) return [];
    return [{ value: scaled(bytes[2] / 127, decl) }];
  }
  return [];
}

/**
 * MIDI access, asked for once in the gesture's handler: `{ ok: true, access }`, or H014 when the browser has none or
 * the person (or the frame's permissions) refused it; the other adapters still play.
 * @param {{ requestMIDIAccess?: () => Promise<unknown> }} navigator
 */
export async function midiAccess(navigator) {
  if (typeof navigator?.requestMIDIAccess !== "function") return { ok: false, code: "H014", severity: "warning", message: "this browser gives the page no MIDI (navigator.requestMIDIAccess is absent), so MIDI Controls play from keys and the screen only" };
  try { return { ok: true, access: await navigator.requestMIDIAccess() }; } catch (e) {
    return { ok: false, code: "H014", severity: "warning", message: `MIDI access was refused (${e instanceof Error ? e.message : e}), so MIDI Controls play from keys and the screen only` };
  }
}
