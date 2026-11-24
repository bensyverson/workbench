import { program, params, int, num } from "kit";
import { cave } from "cave";
import { tiles, actor, tile } from "tiles";
import { glow } from "glow";
import { noise } from "./lib/noise.js";

const $ = params({
  seed: int(3, 0, 99, "Seed"),
  density: num(0.45, 0.2, 0.8, "Rock density"),
  reach: int(6, 2, 12, "Lamp reach (cells)"),
});

// Build time: a longer reach means fewer crickets, so the game stays fair.
const crickets = Math.max(2, 9 - $.reach);

const level = cave("depths")
  .size(24, 16)
  .seed(() => $.seed + game.out.depth)
  .carve(c => noise(c.x * 0.35 + c.seed * 0.7, c.y * 0.35) < $.density)
  .smooth(3)
  .spawns("start", { count: 1, where: c => c.x < 6 })
  .spawns("jar", { count: 5, where: c => c.rand < 0.3 })
  .spawns("cricket", { count: crickets, where: c => c.x > 8 })
  .exit({ where: c => c.x > 18 });

const Miner = actor("Miner")
  .look({ color: "#fd4", glyph: "@" })
  .update((self, w) => { w.move(self, w.input.dir * 1.2); });

const Jar = actor("Jar").look({ color: "#7ff" });

const Cricket = actor("Cricket")
  .look({ color: "#c8a" })
  .state({ awake: ["bool", false] })
  .update((self, w) => {
    // GAP: a length in cells has no named conversion to px; the reach is multiplied by 8 by hand.
    if (self.awake === false && distance(self.pos, w.player.pos) < $.reach * 8.0) {
      self.awake = true;
    }
    if (self.awake && distance(self.pos, w.player.pos) > 1.0) {
      w.move(self, normalize(w.player.pos - self.pos) * 0.7);
    }
  });

const game = tiles("game")
  .screen(192, 128)
  .tiles({ wall: { color: "#334", solid: true }, floor: { color: "#120e0a" } })
  .map(level.out.cells, { rock: "wall", open: "floor" })
  .spawn(Miner, level.out.spawns, { kind: "start", init: s => ({ pos: tile(s.at) }) })
  .player(Miner)
  .spawn(Jar, level.out.spawns, { kind: "jar", init: s => ({ pos: tile(s.at) }) })
  .spawn(Cricket, level.out.spawns, { kind: "cricket", init: s => ({ pos: tile(s.at), awake: false }) })
  .state({ oil: ["f32", 100], depth: ["int", 1], cool: ["int", 0] })
  .update(w => {
    w.state.oil -= 0.04;
    if (w.state.cool > 0) { w.state.cool -= 1; }
    for (const j of w.touching(w.player, Jar)) {
      j.remove();
      w.state.oil = min(100, w.state.oil + 25);
    }
    for (const k of w.touching(w.player, Cricket)) {
      k.remove();
      w.state.oil -= 20;
    }
    // The cooldown stops one step on the exit from descending twice while the new cave loads.
    if (w.state.cool <= 0 && distance(w.player.pos, tile(level.out.exit)) < 6) {
      w.state.depth += 1;
      w.state.cool = 120;
    }
    if (w.state.oil <= 0) { w.end("The lamp is out"); }
  })
  .export("depth", "int", w => w.state.depth)
  .export("oil", "f32", w => w.state.oil)
  .export("miner", "vec2@px", w => w.player.pos)
  .export("exit", "vec2@px", w => tile(level.out.exit))
  // GAP: a length in cells has no named conversion to px; the reach is multiplied by 8 by hand.
  .export("reach", "f32", w => $.reach * 8.0);

const light = glow("light")
  .over(game.out.image)
  .light(p => {
    const d = distance(p.xy, game.out.miner);
    const flicker = noise(p.xy.x * 0.05, p.t * 3.0) * 4.0;
    const radius = game.out.reach * clamp(game.out.oil / 100.0, 0.25, 1.0) + flicker;
    const lit = 1.0 - smoothstep(radius - 6.0, radius, d);
    const e = distance(p.xy, game.out.exit);
    const beacon = 0.35 * (1.0 - smoothstep(0.0, 10.0, e));
    return p.color * (0.05 + 0.95 * lit) + vec3(0.9, 0.7, 0.2) * beacon;
  });

export default program("Glowworm Deep").show(light);
