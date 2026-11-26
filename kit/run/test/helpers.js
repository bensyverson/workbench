// Shared by kit/run's tests (no test here): the seams fixtures' maze and particles with runtimes, and a tiny Dialect
// factory for wires the two do not have. Each call makes fresh Dialects, so a case can change one.

import { defineDialect, defineGrammar, defineRuntime, exact, list, struct, vector, name, data, lambda } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { mazeDecl, particlesDecl, mazeGrammar, particlesGrammar } from "../../define/fixtures/seams-dialects.js";

/** A corridor: the player starts at (1, 1); coins at x = 3 and 4. */
export const CORRIDOR = ["#######", "#..cc.#", "#######"];

/** The maze Dialect, Grammar and a runtime: walk one cell per step the pad says, pick a coin, push `picked`. */
export function mazeKit(/** @type {{ step?: Function, max?: number, clock?: (r: any) => unknown }} */ o = {}) {
  const decl = mazeDecl();
  const grammar = mazeGrammar(defineDialect(/** @type {any} */ (decl)));
  const runtime = defineRuntime(grammar, {
    clock: o.clock ?? ((/** @type {any} */ r) => ({ tick: r.tick ?? 1 / 8 })),
    init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid }),
    step: /** @type {any} */ (o.step ?? mazeStep),
    events: { out: { picked: o.max ?? 8 } },
  });
  return { grammar, runtime };
}

/** @param {any} s @param {any} ctx */
export function mazeStep(s, ctx) {
  const pl = { x: s.player.x, y: s.player.y, dx: 0, dy: 0 };
  ctx.kernels.control(pl, ctx.controls.pad ?? { up: false, down: false, left: false, right: false });
  const x = s.player.x + pl.dx, y = s.player.y + pl.dy;
  if (s.grid[y][x] === "#") return { ...s, t: s.t + ctx.dt };
  let { grid, score } = s;
  if (grid[y][x] === "c") {
    ctx.events.picked.push({ at: [x, y] });
    grid = grid.map((/** @type {string} */ row, /** @type {number} */ j) => (j === y ? row.slice(0, x) + "." + row.slice(x + 1) : row));
    score += 1;
  }
  return { ...s, t: s.t + ctx.dt, score, grid, player: { x, y } };
}

export const STEER = "(pl, pad) => { pl.dx = pad.right ? 1 : pad.left ? -1 : 0; pl.dy = 0; }";

/**
 * The particles Dialect with a state that records each burst it takes (`seen`), and a runtime that spawns one
 * particle per burst through its spawn Kernel, which reads `ev.at` and `inp.radius`.
 */
export function fxKit(/** @type {{ clock?: any, delivery?: any, max?: number, step?: Function }} */ o = {}) {
  const decl = particlesDecl();
  decl.state = { t: "f64", bounds: struct({ width: "f64", height: "f64" }), seen: list(struct({ T: "f64", x: "f64", y: "f64", rev: "f64" }), 1000), radius: "f64" };
  if (o.delivery) decl.ports.in.burst.delivery = o.delivery;
  const grammar = particlesGrammar(defineDialect(/** @type {any} */ (decl)));
  const runtime = defineRuntime(grammar, {
    clock: () => o.clock ?? { tick: 1 / 30 },
    init: (/** @type {any} */ r) => ({ t: 0, bounds: r.bounds, seen: [], radius: 0 }),
    step: /** @type {any} */ (o.step ?? fxStep),
    events: { in: { burst: o.max ?? 8 } },
  });
  return { grammar, runtime };
}

/** @param {any} s @param {any} ctx */
export function fxStep(s, ctx) {
  const seen = [...s.seen];
  for (const ev of ctx.inputs.burst) {
    const p = { pos: [0, 0], vel: [0, 0], life: 0 };
    ctx.globals.ev = ev;
    ctx.kernels["pop.spawn"](p, ctx.rng, ctx.dt);
    seen.push({ T: ctx.T, x: p.pos[0], y: p.pos[1], rev: ctx.inputs.$rev.burst ?? 0 });
  }
  return { ...s, t: s.t + ctx.dt, seen, radius: ctx.inputs.radius };
}

export const SPAWN = "(p, rng) => { p.pos = ev.at; p.life = inp.radius; }";

/**
 * The coin-bursts composition on the corridor: level → fx, "fit" (the corridor's 7 × 3 cells into 320 × 320 px:
 * 320/7 px a cell). `wire` options and the kits can be changed.
 */
export function bursts(/** @type {{ maze?: any, fx?: any, wire?: any, tick?: number, packages?: any }} */ o = {}) {
  const M = o.maze ?? mazeKit(), F = o.fx ?? fxKit();
  let l = /** @type {any} */ (M.grammar("level").grid(CORRIDOR).control(STEER));
  if (o.tick) l = l.tick(o.tick);
  const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn(SPAWN));
  const c = compose("bursts").part(l).part(f).frame(l.frame.cell, f.frame.px, { scale: 10, offset: 5 }).wire(l.out.picked, f.in.burst, o.wire);
  const runtimes = [M.runtime, F.runtime];
  return { composed: c.build({ runtimes }), runtimes, M, F };
}

/** A scripted D-pad: hold right from T on. @param {number} T */
export const rightAt = (T) => ({ kind: "control", T, part: "level", name: "pad", value: { up: false, down: false, left: false, right: true } });

/**
 * A tiny Dialect and Grammar with the ports, state and frames given, and a runtime from `rt`.
 * @param {string} n @param {{ ports: any, state: any, frames?: any, inputs?: boolean }} d @param {any} rt
 */
export function tiny(n, d, rt) {
  for (const side of ["out", "in"]) for (const p of Object.values(d.ports[side] ?? {})) p.note ??= "n";
  const dialect = defineDialect(/** @type {any} */ ({
    name: n, numberType: "f64", text: () => "",
    types: { v2: vector(2, "f64") },
    spaces: { s: { pure: true } },
    objects: { In: { label: "the inputs (inp)", members: {} }, Params: { label: "the params ($)", members: {} } },
    globals: { inp: "In", $: "Params" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    params: { object: "Params", name: "$" },
    environment(/** @type {any} */ program) {
      /** @type {Record<string, string>} */
      const params = {};
      for (const p of Object.keys(program.params ?? {})) params[p] = "f64";
      return { objects: { Params: { members: params } } };
    },
    state: d.state,
    frames: d.frames ?? { px: { dims: 2, note: "pixels" } },
    ports: d.ports,
    ...(d.inputs === false ? {} : { inputs: { object: "In", name: "inp" } }),
  }));
  const grammar = defineGrammar(dialect, {
    root: n, params: { slot: "param" },
    constructs: { [n]: { opens: [name()], slots: { param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" }, k: { kind: "decl", args: [lambda("k")] }, size: { kind: "decl", args: [data("number")], once: true } } } },
  });
  return { grammar, runtime: defineRuntime(grammar, rt) };
}

/**
 * A numbered-Event pair for queue windows: prod (`a`) pushes `per` records a step, numbered in order; cons (`b`)
 * keeps each record's n, the T it took it at, and its largest batch. `extra` parts join the composition unwired.
 * @param {{ prodClock: any, consClock: any, per?: number, max?: number, delivery?: any, wire?: any, prodStep?: Function, consStep?: Function, extra?: Array<{ part: any, runtime: any }> }} o
 */
export function pair(o) {
  const per = o.per ?? 1;
  const prod = tiny("prod", { state: { n: "f64" }, inputs: false, ports: { out: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => o.prodClock, init: () => ({ n: 0 }), step: o.prodStep ?? ((/** @type {any} */ s, /** @type {any} */ c) => { let n = s.n; for (let i = 0; i < per; i++) c.events.e.push({ n: n++ }); return { n }; }), events: { out: { e: per } } });
  const consPort = { seam: "Event<{ n: f64 }>", ...(o.delivery ? { delivery: o.delivery } : {}) };
  const cons = tiny("cons", { state: { got: list("f64", 100000), Ts: list("f64", 100000), biggest: "f64" }, inputs: false, ports: { in: { e: consPort } } },
    { clock: () => o.consClock, init: () => ({ got: [], Ts: [], biggest: 0 }), step: o.consStep ?? ((/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.n)], Ts: [...s.Ts, ...c.inputs.e.map(() => c.T)], biggest: Math.max(s.biggest, c.inputs.e.length) })), events: { in: { e: o.max ?? 8 } } });
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  let c = compose("p").part(a).part(b);
  for (const x of o.extra ?? []) c = c.part(x.part);
  c = c.wire(a.out.e, b.in.e, o.wire);
  const runtimes = [prod.runtime, cons.runtime, ...(o.extra ?? []).map((x) => x.runtime)];
  return { composed: c.build({ runtimes }), runtimes, prod, cons, built: c };
}

/** A part with no ports at a clock: it only makes instants. @param {string} n @param {any} clock */
export function ticker(n, clock) {
  const t = tiny(n, { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } }, { clock: () => clock, init: () => ({ k: 0 }), step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
  return { part: /** @type {any} */ (t.grammar(n + "x")), runtime: t.runtime };
}
