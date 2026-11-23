// Runs a DMG build headless and records a per-tick trace complete enough to compare
// two runs: more than `rt.obs()`, which omits the background map, visibility,
// oamStart, RNG use, bot choices and the full log.

/** @import { DmgBuild, DmgRuntime, LogEntry } from "./dmg.js" */
import { encoderFor } from "./encode.js";

/**
 * @typedef {object} TraceOptions
 * @property {number} seed          Runtime RNG seed. Always explicit: the DMG UI ignores Game.seed().
 * @property {number} frames
 * @property {string[][]} [input]   Buttons held on each tick; missing ticks hold nothing.
 * @property {number} [renderEvery] Render after every Nth tick and record a framebuffer hash. Default 4, as the DMG's own agent run; 0 never renders.
 * @property {boolean} [bot]        Drive input from the build's bot lambda. Default: only when `input` is absent. The bot runs and is recorded either way.
 * @property {Record<string, unknown>} [params] Live params, applied before tick 0 (the runtime restarts once so timers see them).
 *
 * @typedef {object} EntRecord
 * @property {string} kind
 * @property {boolean} alive
 * @property {boolean} visible
 * @property {unknown} x   Encoded: -0 is distinct from 0.
 * @property {unknown} y
 * @property {Record<string, unknown>} v
 *
 * @typedef {object} Tick
 * @property {number} frame
 * @property {boolean} over
 * @property {string} reason
 * @property {Record<string, unknown>} world
 * @property {EntRecord[]} ents
 * @property {{ hash: string, glyphs: string, scx: number, scy: number }} bg  Tile indices, the tile names they point at (glyph meaning), scroll.
 * @property {number} oamStart
 * @property {number} rng      RNG draws made during this tick, bot included; draws made by reset-time inits are not counted.
 * @property {string[]} [bot]  What the bot chose, when the build has one.
 * @property {LogEntry[]} log  Entries logged during this tick.
 * @property {string} [fb]     Framebuffer hash, on render ticks only.
 * @property {string} [error]
 *
 * @typedef {object} Trace
 * @property {Tick[]} ticks
 */

/**
 * FNV-1a over bytes, as hex: enough to tell two maps, frames or name lists apart.
 * @param {ArrayLike<number>} a
 */
export function hash(a) {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** @param {string[]} names */
const hashNames = (names) => hash(new TextEncoder().encode(names.join("\n")));

/**
 * Counts every draw from the runtime's RNG. The runtime replaces `rnd` on each reset
 * (a restart after game over), so the count lives in an accessor that outlives it.
 * @param {DmgRuntime} rt
 * @returns {() => number}
 */
function countDraws(rt) {
  let inner = rt.rnd;
  let draws = 0;
  Object.defineProperty(rt, "rnd", {
    configurable: true,
    get: () => (/** @type {unknown[]} */ ...a) => { draws++; return inner(...a); },
    set: (f) => { inner = f; },
  });
  return () => draws;
}

/**
 * @param {DmgRuntime} rt
 * @param {(v: unknown) => any} enc
 */
function entities(rt, enc) {
  return rt.ents.map((e) => {
    const t = rt._tmap.get(e);
    if (!t) throw new Error(`entity ${e.kind} has no runtime state`);
    return { kind: e.kind, alive: t.alive, visible: t.visible, x: enc(t.x), y: enc(t.y), v: enc(t.v) };
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
  /** @type {(v: unknown) => any} */
  let enc = (v) => v;
  const rt = build.runtime({ seed: opts.seed, hooks: { onLog: (e) => { pending.push(enc(e)); } } });
  enc = encoderFor(rt);
  const drawCount = countDraws(rt);
  if (opts.params) {
    // The runtime's own `params` option throws (it logs before `log` exists), so apply them here.
    for (const [k, v] of Object.entries(opts.params)) rt.set(k, v);
    rt.reset(); // timers read their params at reset
  }
  const botDrives = opts.bot ?? opts.input === undefined;
  const every = opts.renderEvery ?? 4;
  let drawsBefore = drawCount();
  /** @type {Tick[]} */
  const ticks = [];
  for (let i = 0; i < opts.frames; i++) {
    const botChoice = rt.s.bot ? rt.botInput() : null;
    rt._tick(botDrives && botChoice ? botChoice : (opts.input?.[i] ?? []));
    const drawsNow = drawCount();
    /** @type {Tick} */
    const tick = {
      frame: rt.frame, over: rt.over, reason: rt.overReason,
      world: enc(rt.wv), ents: entities(rt, enc),
      bg: { hash: hash(rt.bg.map), glyphs: hashNames(rt.bg.ts.names), scx: rt.bg.scx, scy: rt.bg.scy },
      oamStart: rt.oamStart, rng: drawsNow - drawsBefore, log: pending,
    };
    drawsBefore = drawsNow;
    if (botChoice) tick.bot = enc(botChoice);
    if (every > 0 && (i + 1) % every === 0) { rt.render(); tick.fb = hash(rt.fb); }
    pending = [];
    if (rt.err) { tick.error = rt.err.message; ticks.push(tick); break; }
    ticks.push(tick);
  }
  return { ticks };
}

/**
 * Finds the first place two values differ, depth first, in key order. Values are
 * already in the trace encoding, so `Object.is` is the right leaf comparison.
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
 * A tick where only one run failed is reported as `error`, ahead of whatever else differs there.
 * @param {Trace} a
 * @param {Trace} b
 * @returns {{ tick: number, path: string, a: unknown, b: unknown } | null}
 */
export function firstDifference(a, b) {
  const n = Math.max(a.ticks.length, b.ticks.length);
  for (let i = 0; i < n; i++) {
    const ta = a.ticks[i], tb = b.ticks[i];
    if (!ta || !tb) return { tick: i, path: "(missing tick)", a: ta, b: tb };
    if (ta.error !== tb.error) return { tick: i, path: "error", a: ta.error, b: tb.error };
    const d = diffValue(ta, tb, "");
    if (d) return { tick: i, ...d };
  }
  return null;
}
