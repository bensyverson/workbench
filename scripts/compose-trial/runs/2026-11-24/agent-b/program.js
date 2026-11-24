import { program, params, int, num } from "kit";
import { cave } from "cave";
import { tiles, actor, tile, cell } from "tiles";
import { glow } from "glow";
import { noise } from "./lib/noise.js";

const $ = params({
  seed: int(3, 0, 99, "Seed"),
  density: num(0.45, 0.2, 0.7, "Rock density"),
  reach: int(6, 2, 12, "Lamp reach"),
});

// Build time: a longer reach holds fewer crickets (plain JS, reads the parameter).
const cricketCount = Math.max(1, 10 - $.reach);

const level = cave("depths")
  .size(24, 16)
  .seed(() => $.seed + game.out.depth)
  .carve(c => noise(c.x * 0.35 + c.seed * 7.0, c.y * 0.35 + c.seed * 3.0) < $.density)
  .smooth(2)
  .spawns("start", { count: 1, where: c => c.x < 6 })
  .spawns("jar", { count: 4 })
  .spawns("cricket", { count: cricketCount, where: c => c.x > 6 })
  .exit({ where: c => c.x > 17 });

const Jar = actor("Jar").look({ color: "#8f4", glyph: "o" });

const Cricket = actor("Cricket").look({ color: "#a73", glyph: "c" })
  .update((self, w) => {
    if (distance(self.pos, w.player.pos) < $.reach * 8.0) {
      // GAP: "hops" (discrete jumps) cannot be expressed; crickets glide
      w.move(self, normalize(w.player.pos - self.pos) * 0.6);
    }
    for (const m of w.touching(self, Miner)) {
      w.state.oil -= 12.0;
      self.remove();
    }
  });

const Miner = actor("Miner").look({ color: "#fd4", glyph: "@" })
  .update((self, w) => {
    w.move(self, w.input.dir * 1.2);
    w.state.oil -= 0.05;
    for (const j of w.touching(self, Jar)) {
      w.state.oil = min(100.0, w.state.oil + 30.0);
      j.remove();
    }
  });

const game = tiles("game")
  .screen(192, 128)
  .tiles({ wall: { color: "#334", solid: true }, floor: { color: "#222" } })
  .map(level.out.cells, { rock: "wall", open: "floor" })
  .spawn(Miner, level.out.spawns, { kind: "start", init: s => ({ pos: tile(s.at) }) })
  .spawn(Jar, level.out.spawns, { kind: "jar", init: s => ({ pos: tile(s.at) }) })
  .spawn(Cricket, level.out.spawns, { kind: "cricket", init: s => ({ pos: tile(s.at) }) })
  .player(Miner)
  .state({ oil: ["f32", 100.0], depth: ["int", 0] })
  .update(w => {
    // GAP: after depth rises the old exit stays until the cave re-steps (one-step delay), so depth may rise again on the next tick; no way to ask "has the level reloaded" or to emit/consume a level-change event across parts
    if (distance(w.player.pos, tile(level.out.exit)) < 4.0) {
      w.state.depth += 1;
    }
    if (w.state.oil <= 0.0) {
      w.end("The lamp went out");
    }
  })
  .export("player", "vec2@px", w => w.player.pos)
  .export("oil", "f32", w => w.state.oil)
  .export("depth", "int", w => w.state.depth)
  .export("exitPx", "vec2@px", w => tile(level.out.exit));

// GAP: the exit's faint glow is lit by exported pixel position; the exit is drawn in no tile kind of its own (map values are only rock/open)
const light = glow("light")
  .over(game.out.image)
  .sample(game.out.player, "lerp")
  .light(p => {
    const flick = noise(p.t * 3.0, 0.5) * 0.15;
    const radius = $.reach * 8.0 * (0.3 + 0.7 * clamp(game.out.oil / 100.0, 0.0, 1.0)) * (0.9 + flick);
    const d = distance(p.xy, game.out.player);
    const k = 1.0 - smoothstep(radius * 0.5, radius, d);
    const e = 0.15 * (1.0 - smoothstep(2.0, 14.0, distance(p.xy, game.out.exitPx)));
    return p.color * (0.04 + k + e);
  });

export default program("Glowworm Deep").show(light);
