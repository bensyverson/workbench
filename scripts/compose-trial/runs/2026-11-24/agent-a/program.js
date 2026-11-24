import { program, params, int, num } from "kit";
import { cave } from "cave";
import { tiles, actor, tile } from "tiles";
import { glow } from "glow";
import { noise } from "./lib/noise.js";

const $ = params({
  seed: int(3, 0, 99, "Seed"),
  density: num(0.45, 0.3, 0.6, "Rock density"),
  reach: int(5, 2, 9, "Lamp reach (cells)"),
});

// Build time: a longer reach means fewer crickets.
const crickets = Math.max(1, 11 - $.reach);

const level = cave("depths")
  .size(24, 16)
  .seed(() => $.seed + game.out.depth)
  .carve(c => noise(c.x * 0.3 + c.seed * 17.0, c.y * 0.3 + c.seed * 5.0) < $.density)
  .smooth(2)
  .spawns("start", { count: 1, where: c => c.x < 6 })
  .spawns("jar", { count: 4 })
  .spawns("cricket", { count: crickets, where: c => c.x > 8 })
  .exit({ where: c => c.x > 18 });

const Miner = actor("Miner").look({ color: "#fd4", glyph: "@" })
  .update((self, w) => { w.move(self, w.input.dir * 1.2); });

const Jar = actor("Jar").look({ color: "#7f9", glyph: "o" });

const Cricket = actor("Cricket").look({ color: "#a84", glyph: "c" })
  .state({ awake: ["bool", false] })
  .update((self, w) => {
    if (distance(self.pos, w.player.pos) < $.reach * 8.0) {
      self.awake = true;
    }
    if (self.awake) {
      w.move(self, normalize(w.player.pos - self.pos) * 0.8);
    }
  });

const game = tiles("game")
  .screen(192, 128)
  .tiles({ wall: { color: "#334", solid: true }, floor: { color: "#111" } })
  .map(level.out.cells, { rock: "wall", open: "floor" })
  .spawn(Miner, level.out.spawns, { kind: "start", init: s => ({ pos: tile(s.at) }) })
  .spawn(Jar, level.out.spawns, { kind: "jar", init: s => ({ pos: tile(s.at) }) })
  .spawn(Cricket, level.out.spawns, { kind: "cricket", init: s => ({ pos: tile(s.at) }) })
  .player(Miner)
  .state({ depth: ["int", 0], oil: ["f32", 1.0] })
  .update(w => {
    w.state.oil = w.state.oil - w.dt * 0.02;
    for (const j of w.touching(w.player, Jar)) {
      w.state.oil = min(1.0, w.state.oil + 0.3);
      j.remove();
    }
    for (const k of w.touching(w.player, Cricket)) {
      w.state.oil = w.state.oil - 0.2;
      k.remove();
    }
    // GAP: nothing says whether the reload (new map, miner back at start) happens before or
    // after .update on the tick after depth rises; if after, the miner is still on the old exit
    // and depth rises twice. The world cannot tell which level it is on, so it cannot guard this.
    if (distance(w.player.pos, tile(level.out.exit)) < 4.0) {
      w.state.depth = w.state.depth + 1;
    }
    if (w.state.oil <= 0.0) {
      w.end("The lamp went out");
    }
  })
  .export("depth", "int", w => w.state.depth)
  .export("oil", "f32", w => w.state.oil)
  .export("player", "vec2@px", w => w.player.pos)
  .export("exit", "vec2@px", w => tile(level.out.exit));

const light = glow("light")
  .over(game.out.image)
  // GAP: "lerp" across a level reload interpolates from the old exit to the new start,
  // sweeping the light across the screen for a frame; there is no way to say "snap on reload".
  .sample(game.out.player, "lerp")
  .light(p => {
    const d = distance(p.xy, game.out.player);
    const flicker = 0.85 + 0.3 * noise(p.t * 6.0, d * 0.05);
    // GAP: reach is in cells but glow has no cell frame and tiles has no scalar cell -> px
    // conversion, so the 8 px cell size is hard-coded here and in Cricket.update.
    const r = $.reach * 8.0 * (0.3 + 0.7 * clamp(game.out.oil, 0.0, 1.0)) * flicker;
    const lit = 1.0 - smoothstep(r * 0.6, r, d);
    const e = 1.0 - smoothstep(2.0, 10.0, distance(p.xy, game.out.exit));
    return p.color * (0.04 + 0.96 * lit) + vec3(0.2, 0.9, 0.5) * 0.35 * e;
  });

export default program("Glowworm Deep").show(light);
