// Keys to the page's controls (kit/compose's PAGE_CONTROLS): a key map from KeyboardEvent.code to a control or a
// pad direction, and the held state that turns key events into page inputs, one record per change, so a key
// repeat sends nothing.

import { PAGE_CONTROLS } from "../compose/page.js";

/** What a key may map to: a pad direction or a button. */
export const KEY_TARGETS = Object.freeze(["pad.up", "pad.down", "pad.left", "pad.right", ...Object.keys(PAGE_CONTROLS).filter((c) => c !== "pad")]);

/** The DMG host's keys (the DMG Workbench's KEYMAP), by KeyboardEvent.code. */
export const DEFAULT_KEYS = Object.freeze({
  ArrowUp: "pad.up", ArrowDown: "pad.down", ArrowLeft: "pad.left", ArrowRight: "pad.right",
  KeyW: "pad.up", KeyS: "pad.down", KeyA: "pad.left", KeyD: "pad.right",
  KeyX: "a", KeyK: "a", KeyZ: "b", KeyJ: "b", Enter: "start", ShiftLeft: "select", ShiftRight: "select",
});

/** A key map, checked: throws naming a target that is not a control. @param {Record<string, string>} keys */
export function checkKeys(keys) {
  if (keys === null || typeof keys !== "object" || Array.isArray(keys)) throw new Error("keys is an object of KeyboardEvent.code to a page control");
  for (const [code, t] of Object.entries(keys)) {
    if (!KEY_TARGETS.includes(t)) throw new Error(`keys.${code}: ${t} is not a page control: the controls are ${KEY_TARGETS.join(", ")}`);
  }
  return Object.freeze({ ...keys });
}

/**
 * The held state of the controls, from key events: `press(code, down)` gives the page input a change makes, or
 * null when it changes nothing (a repeat, a second key for a held direction), or undefined for a key not in the map.
 * @param {Readonly<Record<string, string>>} keys
 */
export function keyState(keys) {
  /** the codes held down, by target */
  const held = new Map(KEY_TARGETS.map((t) => [t, new Set()]));
  const isHeld = (/** @type {string} */ t) => /** @type {Set<string>} */ (held.get(t)).size > 0;
  const pad = () => ({ up: isHeld("pad.up"), down: isHeld("pad.down"), left: isHeld("pad.left"), right: isHeld("pad.right") });
  return {
    /** @param {string} code @param {boolean} down @returns {{ name: string, value: Record<string, boolean> } | null | undefined} */
    press(code, down) {
      if (!Object.hasOwn(keys, code)) return undefined;
      const target = keys[code];
      const codes = /** @type {Set<string>} */ (held.get(target));
      const was = codes.size > 0;
      if (down) codes.add(code); else codes.delete(code);
      if (was === codes.size > 0) return null;
      return target.startsWith("pad.") ? { name: "pad", value: pad() } : { name: target, value: { held: down } };
    },
  };
}
