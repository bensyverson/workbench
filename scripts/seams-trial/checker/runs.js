// The relay's runs on kit/run: a part built from an example and run alone, a maze player steered to a coin by a
// D-pad the checker presses (closed loop: each maze step it holds the direction of the shortest path to the
// nearest coin not yet visited), a probe part that sends one record to a particles Event input, and each Event
// output's records caught by wrapping a runtime's step (a development run steps twice; the records are kept by
// instant, so the second run replaces the first's).

import { defineDialect, defineGrammar, defineRuntime, exact, name } from "../../../kit/define/index.js";
import { compose } from "../../../kit/compose/index.js";
import { createRun } from "../../../kit/run/index.js";
import { printSeam } from "../../../kit/seam/index.js";

/** The D-pad, nothing held. */
export const RELEASED = Object.freeze({ up: false, down: false, left: false, right: false, a: false, b: false });
/** The control name the page sends a D-pad as (runtime.md, "Controls"). */
export const PAD = "pad";

/**
 * A runtime that steps as `rt` does and pushes no Event: what a part does when nothing it says is ever delivered.
 * @param {any} rt
 */
export function silencing(rt) {
  return defineRuntime(rt.grammar, {
    clock: rt.clock, init: rt.init, events: rt.events,
    step(/** @type {any} */ state, /** @type {any} */ ctx) {
      const next = rt.step(state, ctx);
      for (const v of Object.values(ctx.events)) /** @type {unknown[]} */ (v).length = 0;
      return next;
    },
  });
}

/**
 * A runtime whose step also keeps the Event records it pushes, by instant: `caught.get(T)` is `{ port: records }`.
 * @param {any} rt
 */
export function catching(rt) {
  /** @type {Map<number, Record<string, unknown[]>>} */
  const caught = new Map();
  const runtime = defineRuntime(rt.grammar, {
    clock: rt.clock, init: rt.init, events: rt.events,
    step(/** @type {any} */ state, /** @type {any} */ ctx) {
      const next = rt.step(state, ctx);
      caught.set(ctx.T, Object.fromEntries(Object.entries(ctx.events).map(([k, v]) => [k, [.../** @type {unknown[]} */ (v)].map((r) => structuredClone(r))])));
      return next;
    },
  });
  return { runtime, caught };
}

/**
 * The next direction from `from` along a shortest path through `grid` (rows of text, `#` a wall) to the nearest
 * cell in `targets`, or null when none is reachable.
 * @param {string[]} grid @param {{ x: number, y: number }} from @param {Set<string>} targets
 * @returns {"up" | "down" | "left" | "right" | null}
 */
export function towards(grid, from, targets) {
  const key = (/** @type {number} */ x, /** @type {number} */ y) => `${x},${y}`;
  /** @type {Array<[number, number, "up" | "down" | "left" | "right" | null]>} */
  const queue = [[from.x, from.y, null]];
  const seen = new Set([key(from.x, from.y)]);
  /** @type {Array<[number, number, "up" | "down" | "left" | "right"]>} */
  const moves = [[0, -1, "up"], [0, 1, "down"], [-1, 0, "left"], [1, 0, "right"]];
  while (queue.length) {
    const [x, y, first] = /** @type {[number, number, any]} */ (queue.shift());
    if (first && targets.has(key(x, y))) return first;
    for (const [dx, dy, dir] of moves) {
      const nx = x + dx, ny = y + dy;
      const c = grid[ny]?.[nx];
      if (c === undefined || c === "#" || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny, first ?? dir]);
    }
  }
  return null;
}

/** Every coin cell of a grid, as "x,y". @param {string[]} grid */
export const coinsOf = (grid) => new Set(grid.flatMap((row, y) => [...row].flatMap((c, x) => (c === "c" ? [`${x},${y}`] : []))));

/**
 * Steps `run` until the maze part's player stands on a coin cell of its record's grid (the first one), holding
 * the D-pad toward the nearest coin, or until `limit` seconds. Returns the instant and cell, or why not.
 * `onStep(info)` sees each instant the run steps.
 * @param {any} run @param {string} part @param {string[]} grid @param {number} limit @param {(info: any) => void} [onStep]
 * @returns {{ T: number, cell: [number, number] } | { why: string }}
 */
export function steerToCoin(run, part, grid, limit, onStep = () => {}) {
  const coins = coinsOf(grid);
  if (!coins.size) return { why: "its grid has no coin" };
  /** @type {string | null} */
  let held = null;
  while (run.seconds < limit) {
    const s = run.state(part);
    if (!s) return { why: "its runtime stopped (see the N diagnostics)" };
    const p = s.player;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return { why: "its state has no player.x and player.y" };
    const dir = towards(grid, p, coins);
    if (!dir) return { why: `no coin can be reached from (${p.x}, ${p.y})` };
    if (dir !== held) { run.input({ kind: "control", part, name: PAD, value: { ...RELEASED, [dir]: true } }); held = dir; }
    let i = run.step();
    if (i) onStep(i);
    while (i && !i.stepped.includes(part)) { i = run.step(); if (i) onStep(i); }
    if (!i) return { why: "nothing has a clock" };
    const q = run.state(part)?.player;
    if (q && coins.has(`${q.x},${q.y}`)) return { T: run.seconds, cell: [q.x, q.y] };
  }
  return { why: `the player did not reach a coin in ${limit} s` };
}

/**
 * A value of a seam type, for a probe's record: a point at `point(frame)`, other numbers 1, a vector zero, an enum
 * its first value, a list empty.
 * @param {any} seam @param {(frame: string, dims: number) => number[]} point
 * @returns {unknown}
 */
export function sampleOf(seam, point) {
  switch (seam.kind) {
    case "scalar": return seam.of === "f64" ? 1 : seam.of === "bool" ? true : "probe";
    case "quantity": return 1;
    case "point": { const v = point(seam.frame, seam.dims); return seam.dims === 1 ? v[0] : v; }
    case "vector": return new Array(seam.dims).fill(0);
    case "enum": return seam.values[0];
    case "record": return Object.fromEntries(Object.entries(seam.fields).map(([k, f]) => [k, sampleOf(f, point)]));
    case "list": return [];
    case "event": return sampleOf(seam.of, point);
    default: return null;
  }
}

/**
 * A seam without the record fields an input gives a default for: what a stranger's producer may send. An output
 * may not declare defaults (D028), and a probe that sends only these fields leaves the defaults for the wire to
 * fill, as a stranger's wire would (a probe that sent every field would send its own made-up values instead).
 * @param {any} seam @returns {any}
 */
export function withoutDefaults(seam) {
  if (seam?.kind === "event") return { ...seam, of: withoutDefaults(seam.of) };
  if (seam?.kind !== "record") return seam;
  const { defaults = {}, ...rest } = seam;
  return { ...rest, fields: Object.fromEntries(Object.entries(seam.fields).filter(([k]) => !Object.hasOwn(defaults, k)).map(([k, f]) => [k, withoutDefaults(f)])) };
}

/**
 * A probe part for an Event input of `target`'s Dialect: a Dialect with the same frames (no edges) and one Event
 * output of the input's seam less its defaulted fields, whose runtime pushes `record` (less those fields) once, at its
 * step at `at` seconds.
 * @param {any} target  the consumer's Dialect @param {string} input @param {unknown} record @param {number} at
 */
export function probeFor(target, input, record, at) {
  const seam = withoutDefaults(target.seams.in[input].seam);
  const sent = seam.of?.kind === "record" && record && typeof record === "object" ? Object.fromEntries(Object.keys(seam.of.fields).map((k) => [k, /** @type {any} */ (record)[k]])) : record;
  /** @type {Record<string, { dims: 1 | 2 | 3, note: string }>} */
  const frames = {};
  for (const f of Object.values(/** @type {Record<string, any>} */ (target.seams.frames))) frames[f.name] = { dims: f.dims, note: "the probe's copy of the consumer's frame" };
  const d = defineDialect({
    name: "probe", numberType: "f64", spaces: { none: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { unused: { params: [], returns: "f64", space: "none" } },
    state: { sent: "bool" }, text: (s) => (s.sent ? "sent" : "waiting"),
    frames, ports: { out: { fire: { seam: printSeam(seam), note: "the checker's probe record" } } },
  });
  const g = defineGrammar(d, { root: "probe", constructs: { probe: { opens: [name()] } } });
  const tick = 1 / 4;
  const runtime = defineRuntime(g, {
    clock: () => ({ tick }),
    init: () => ({ sent: false }),
    step(/** @type {any} */ s, /** @type {any} */ ctx) {
      if (!s.sent && ctx.T >= at - 1e-9) { ctx.events.fire.push(structuredClone(sent)); return { sent: true }; }
      return s;
    },
    events: { out: { fire: 1 } },
  });
  return { builder: g("probe"), runtime };
}

/**
 * A composition of `parts` (builders), each frame pair related by identity, and the wires, built and started.
 * @param {{ builders: any[], frames?: Array<[any, any]>, wires?: Array<[any, any]>, show: any, runtimes: any[], build: any, packages?: any[] }} o
 */
export function startRun(o) {
  let c = compose("check");
  for (const b of o.builders) c = c.part(b);
  for (const [a, b] of o.frames ?? []) c = c.frame(a, b, { scale: 1, offset: 0 });
  for (const [a, b] of o.wires ?? []) c = c.wire(a, b);
  c = c.show(o.show);
  const options = { build: o.build, runtimes: o.runtimes, packages: o.packages ?? [] };
  const problems = c.check(options);
  if (problems.length) return { problems, run: null, composed: null };
  const composed = c.build(options);
  return { problems: [], composed, run: createRun(composed, { runtimes: o.runtimes, packages: (o.packages ?? []).map((p) => ({ name: p.name, content: p.content })) }) };
}
