// Test fixtures for kit/page: a composed workbench whose shown part (`scr`, kit/draw's screen fixture) layers the
// maze's picture under a HUD, a walker (`hero`) that takes the page's D-pad and A button as Events, the maze
// package loaded by kit/package with a PNG header for its sheet, and a fake Canvas 2D context that records every
// call. They live beside test/, not in it, since every file under a test/ folder runs as a test.

import { defineRuntime, list } from "../../define/index.js";
import { compose, page } from "../../compose/index.js";
import { loadPackage, hashText } from "../../package/index.js";
import { pngHeader } from "../../package/fixtures/png.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { tiny, mazeStep } from "../../run/test/helpers.js";

const right = "(pl, pad) => { pl.dx = 1; }";

/** A walker that counts the D-pad's right presses and the A button's presses, by their $T. */
function walker() {
  return tiny("walk", {
    state: { x: "f64", a: "f64", seen: list("f64", 1000) }, inputs: false,
    ports: { in: { pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>" }, fire: { seam: "Event<{ held: bool }>" } } },
  }, {
    clock: () => ({ tick: 1 / 8 }), init: () => ({ x: 0, a: 0, seen: [] }),
    step: (/** @type {any} */ s, /** @type {any} */ c) => {
      let x = s.x, a = s.a;
      const seen = [...s.seen];
      for (const r of c.inputs.pad) { x += r.right ? 1 : 0; seen.push(r.$T); }
      for (const r of c.inputs.fire) a += r.held ? 1 : 0;
      return { x, a, seen };
    },
    events: { in: { pad: 60, fire: 60 } },
  });
}

/**
 * The bench: the composed record, its runtimes and the loaded maze package. `profile` builds it for a renderer
 * profile; `maze` changes the maze's declaration (its sheet has a file unless the change removes it).
 * @param {{ profile?: string, maze?: (d: any) => void, png?: Uint8Array, still?: boolean, layered?: boolean }} [o]  `still`: the player stands still, so the coin is never picked;
 *   `layered`: the screen does not take the maze's picture, and the page shows a layer of the screen under the maze
 */
export async function bench(o = {}) {
  const mg = drawnMaze((d) => { d.images.sheet.file = "art/sheet.png"; o.maze?.(d); });
  const sg = screen();
  const W = walker();
  const coinsOf = (/** @type {string[]} */ grid) => grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "c" ? [{ x, y }] : [])));
  const runtimes = [
    defineRuntime(mg, {
      clock: () => ({ tick: 1 / 8 }),
      init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; },
      events: { out: { picked: 8 } },
    }),
    defineRuntime(sg, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) }),
    W.runtime,
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(o.still ? "(pl, pad) => { pl.dx = 0; }" : right);
  const scr = /** @type {any} */ (sg("scr")).size({ width: 40, height: 32 });
  const hero = /** @type {any} */ (W.grammar("hero"));
  const c = compose("page-bench").part(level).part(scr).part(hero)
    .frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 })
    .wire(level.out.score, scr.in.score)
    .wire(page.out.pad, hero.in.pad).wire(page.out.a, hero.in.fire);
  if (o.layered) c.show(scr.out.view, level.out.view); else c.wire(level.out.view, scr.in.board).show(scr);
  const composed = c.build({ runtimes, ...(o.profile ? { profile: o.profile } : {}) });
  return { composed, runtimes, packages: [await mazePackage(mg, o.png ?? pngHeader(16, 8))] };
}

/** The maze as a loaded package holding its sheet's bytes. @param {any} grammar @param {Uint8Array} png */
async function mazePackage(grammar, png) {
  const src = { "maze.dialect.js": `import { defineDialect } from "kit/define";\n`, "maze.grammar.js": `import { defineGrammar } from "kit/define";\nimport "./maze.dialect.js";\n` };
  const all = { ...src, "art/sheet.png": png };
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [p, t] of Object.entries(all)) hashes[p] = await hashText(t);
  const manifest = { name: "maze", version: "0.1.0", kit: "0.4", entry: { dialect: "maze.dialect.js", grammar: "maze.grammar.js" }, files: hashes };
  const loaded = await loadPackage({ ...all, "wb-package.json": JSON.stringify(manifest) }, { kitVersion: "0.4", importModule: async (p) => (p === "maze.dialect.js" ? { d: grammar.dialect } : { g: grammar }) });
  if (loaded.diagnostics.length) throw new Error(loaded.diagnostics.map((d) => d.message).join("\n"));
  return loaded;
}

/** A Canvas 2D context that records each call as [name, ...args] and each property it is given as ["=name", value]. */
export function fakeContext() {
  /** @type {unknown[][]} */
  const calls = [];
  const target = { calls, canvas: { width: 40, height: 32 } };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return /** @type {any} */ (t)[k];
      if (typeof k !== "string") return undefined;
      return (/** @type {unknown[]} */ ...args) => { calls.push([k, ...args]); return k === "measureText" ? { width: 8 } : undefined; };
    },
    set(_, k, v) { calls.push([`=${String(k)}`, v]); return true; },
  });
  return /** @type {any} */ (ctx);
}

/** A host's frame source: `requestFrame` keeps each callback, and `tick(ms)` calls the one waiting. */
export function frames() {
  /** @type {Array<(ms: number) => void>} */
  const waiting = [];
  return {
    requestFrame: (/** @type {(ms: number) => void} */ cb) => { waiting.push(cb); return waiting.length; },
    /** @param {number} ms */
    tick(ms) { const cb = waiting.shift(); if (!cb) throw new Error("no frame was asked for"); cb(ms); },
    get waiting() { return waiting.length; },
  };
}
