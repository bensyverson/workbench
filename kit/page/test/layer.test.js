// A shown layer on the page (kit/compose README, "Layers" ▸ "What the page draws"): a bottom frame with no extent
// has no canvas size and no text stage to fall back on, so it is H010, never a blank page; and a layer is told from
// a part by its `layer` field, never by a Dialect named layer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose, layer } from "../../compose/index.js";
import { createPage } from "../index.js";
import { decodeSources } from "../sources.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { screen } from "../../draw/fixtures/draw-dialects.js";

const tick = { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) };

/** A page over a bottom screen `a` whose px frame has no extent (when `noExtent`) and a top screen `b`. @param {{ noExtent: boolean, show: "layer" | "part" }} o */
async function mount(o) {
  const ng = screen((d) => { d.name = "noext"; if (o.noExtent) delete d.frames.px.extent; });
  const sg = screen();
  const runtimes = [ng, sg].map((g) => defineRuntime(g, tick));
  const a = /** @type {any} */ (ng("a")).size({ width: 40, height: 32 });
  const b = /** @type {any} */ (sg("b")).size({ width: 40, height: 32 });
  const c = compose("x").part(a).part(b).frame(b.frame.px, a.frame.px, { scale: 1, offset: 0 });
  const composed = (o.show === "layer" ? c.show(layer("l", a.out.view, b.out.view)) : c.show(a)).build({ runtimes });
  const p = createPage({ composed, runtimes, packages: [], context: fakeContext(), requestFrame: frames().requestFrame });
  await p.ready;
  return p;
}

test("a shown layer whose bottom frame has no extent is H010: the page has no size and the host has no stage to show", async () => {
  const p = await mount({ noExtent: true, show: "layer" });
  assert.equal(p.size, null);
  assert.deepEqual(p.diagnostics.map((d) => d.code), ["H010"]);
  assert.match(p.diagnostics[0].message, /layer l.*a\.px.*no extent/);
  assert.equal(p.diagnostics[0].part, "l");
});

test("a layer with an extent has no H010, and a shown part with no extent keeps its text stage without one", async () => {
  assert.deepEqual((await mount({ noExtent: false, show: "layer" })).diagnostics, []);
  assert.deepEqual((await mount({ noExtent: true, show: "part" })).diagnostics, []);
});

test("a Dialect named layer is told from a layer by the part entry's `layer` field: decodeSources decodes its image, and skips a layer entry", async () => {
  const runtimes = [{ dialect: { name: "layer", seams: { images: { sheet: { file: "art/sheet.png" } } } } }];
  const packages = [{ name: "layer", data: { "art/sheet.png": { bytes: new Uint8Array(1), width: 1, height: 1 } } }];
  /** @type {string[]} */
  const seen = [];
  const decode = async (/** @type {Uint8Array} */ _b, /** @type {{ name: string }} */ info) => { seen.push(info.name); return {}; };
  const r = await decodeSources([{ name: "u", dialect: "layer" }, { name: "top", dialect: "layer", layer: {} }], runtimes, packages, decode);
  assert.deepEqual(seen, ["u.sheet"]);
  assert.deepEqual(r.problems, []);
});
