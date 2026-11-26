// A burst of particles where the maze player picks up a coin.
import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

const SPARKS = 80;
const ring = (k, speed) => vec2(Math.cos((k / SPARKS) * 2 * Math.PI), Math.sin((k / SPARKS) * 2 * Math.PI)) * speed;

export default ($) => {
  // 11 x 7 cells. Walk with the D-pad, one cell per step.
  const hunt = maze("hunt")
    .grid([
      "###########",
      "#...c....c#",
      "#.##.#.##.#",
      "#....c....#",
      "#.##.#.##.#",
      "#c.......c#",
      "###########",
    ])
    .start({ x: 1, y: 1 })
    .tick(1 / 8)
    .control((pl, pad) => {
      pl.dx = pad.right ? 1 : pad.left ? -1 : 0;
      pl.dy = pad.down ? 1 : pad.up ? -1 : 0;
      pl.steps = 1;
    });

  // The box has the maze's proportions, 32 pixels to a cell; the wire does the converting.
  const sparks = particles("sparks")
    .bounds({ width: 352, height: 224 })
    .maxParticles(1000)
    .tick(1 / 60)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 140) * dt; })
    .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
    // an even outer ring
    .emitter("ring", { x: 176, y: 112, maxRate: 0, on: "burst", burst: SPARKS })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        p.pos = burst.pos;
        p.vel = ring(i % SPARKS, 130 + 20 * rng());
        p.life = 0.5 + 0.3 * rng();
      })
    // slower embers that linger and fall
    .emitter("embers", { x: 176, y: 112, maxRate: 0, on: "burst", burst: 40 })
      .rate((t, live) => 0)
      .spawn((p, rng) => {
        p.pos = burst.pos;
        p.vel = vec2((rng() - 0.5) * 120, -20 - 100 * rng());
        p.life = 0.8 + 0.7 * rng();
      });

  return compose("coin-burst")
    .part(hunt)
    .part(sparks)
    .frame(hunt.frame.cell, sparks.frame.box, "fit")
    .wire(hunt.out.pickup, sparks.in.burst, { rename: { at: "pos" } })
    .show(sparks);
};
