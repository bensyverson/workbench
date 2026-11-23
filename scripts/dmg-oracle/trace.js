// Runs a DMG build headless and records a per-tick trace complete enough to compare
// two runs: more than `rt.obs()`, which omits the background map, visibility,
// oamStart and the full log.

/** @import { DmgBuild, DmgRuntime, LogEntry } from "./dmg.js" */

/**
 * @typedef {object} TraceOptions
 * @property {number} seed          Runtime RNG seed. Always explicit: the DMG UI ignores Game.seed().
 * @property {number} frames
 * @property {string[][]} [input]   Buttons held on each tick; missing ticks hold nothing.
 * @property {number} [renderEvery] Render after every Nth tick and record a framebuffer hash; 0 never renders.
 * @property {Record<string, unknown>} [params]
 *
 * @typedef {object} EntRecord
 * @property {string} kind
 * @property {boolean} alive
 * @property {boolean} visible
 * @property {number} x
 * @property {number} y
 * @property {Record<string, unknown>} v
 *
 * @typedef {object} Tick
 * @property {number} frame
 * @property {boolean} over
 * @property {string} reason
 * @property {Record<string, unknown>} world
 * @property {EntRecord[]} ents
 * @property {{ hash: string, scx: number, scy: number }} bg
 * @property {number} oamStart
 * @property {LogEntry[]} log  Entries logged during this tick.
 * @property {string} [fb]     Framebuffer hash, on render ticks only.
 * @property {string} [error]
 *
 * @typedef {object} Trace
 * @property {Tick[]} ticks
 */

/**
 * FNV-1a over a typed array, as hex: enough to tell two maps or frames apart.
 * @param {Uint8Array | Uint16Array} a
 */
function hash(a) {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * A JSON-safe deep copy, so later mutation can't change what was recorded.
 * @param {unknown} v
 * @returns {any}
 */
const snapshot = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/** @param {DmgRuntime} rt */
function entities(rt) {
  return rt.ents.map((e) => {
    const t = rt._tmap.get(e);
    if (!t) throw new Error(`entity ${e.kind} has no runtime state`);
    return { kind: e.kind, alive: t.alive, visible: t.visible, x: t.x, y: t.y, v: snapshot(t.v) };
  });
}

/**
 * Runs `build` for `opts.frames` ticks and records each one.
 * @param {DmgBuild} build
 * @param {TraceOptions} opts
 * @returns {Trace}
 */
export function runTrace(build, opts) {
  /** @type {LogEntry[]} */
  let pending = [];
  const rt = build.runtime({ seed: opts.seed, params: opts.params, hooks: { onLog: (e) => { pending.push(snapshot(e)); } } });
  const every = opts.renderEvery ?? 0;
  /** @type {Tick[]} */
  const ticks = [];
  for (let i = 0; i < opts.frames; i++) {
    rt._tick(opts.input?.[i] ?? []);
    /** @type {Tick} */
    const tick = {
      frame: rt.frame, over: rt.over, reason: rt.overReason,
      world: snapshot(rt.wv), ents: entities(rt),
      bg: { hash: hash(rt.bg.map), scx: rt.bg.scx, scy: rt.bg.scy },
      oamStart: rt.oamStart, log: pending,
    };
    if (every > 0 && (i + 1) % every === 0) { rt.render(); tick.fb = hash(rt.fb); }
    pending = [];
    if (rt.err) { tick.error = rt.err.message; ticks.push(tick); break; }
    ticks.push(tick);
  }
  return { ticks };
}

/**
 * Finds the first place two values differ, depth first, in key order.
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} path
 * @returns {{ path: string, a: unknown, b: unknown } | null}
 */
function diffValue(a, b, path) {
  if (Object.is(a, b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return { path, a, b };
  const ao = /** @type {Record<string, unknown>} */ (a), bo = /** @type {Record<string, unknown>} */ (b);
  const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])];
  for (const k of keys) {
    const d = diffValue(ao[k], bo[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

/**
 * Compares two traces tick by tick; returns the first differing tick and field, or null if they match.
 * @param {Trace} a
 * @param {Trace} b
 * @returns {{ tick: number, path: string, a: unknown, b: unknown } | null}
 */
export function firstDifference(a, b) {
  const n = Math.max(a.ticks.length, b.ticks.length);
  for (let i = 0; i < n; i++) {
    const d = diffValue(a.ticks[i], b.ticks[i], "");
    if (d) return { tick: i, ...d, path: d.path || "(missing tick)" };
  }
  return null;
}
