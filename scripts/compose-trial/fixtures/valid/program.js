// The checker's passing fixture: Spore Run. A cave level per round, a mushroom-picking game, a torch light.
import { program, params, int, num } from "kit";
import { cave } from "cave";
import { tiles, actor, tile, cell } from "tiles";
import { glow } from "glow";
import { noise } from "./lib/noise.js";

const $ = params({
  seed: int(5, 0, 99, "Seed"),
  rock: num(0.5, 0.35, 0.65, "Rock density"),
  reach: int(4, 2, 8, "Torch reach (cells)"),
});

const COLS = 24;
const ROWS = 16;

const level = cave("depths")
  .size(COLS, ROWS)
  .seed(() => $.seed * 31 + game.out.round)
  .carve(c => noise(c.x * 0.2, c.y * 0.2 + c.seed) > $.rock)
  .smooth(3)
  .spawns("start", { count: 1, where: c => c.x < 6 })
  .spawns("shroom", { count: 10 - $.reach })
  .exit({ where: c => c.x > 18 });

const Picker = actor("Picker").look({ color: "#fd4", glyph: "@" })
  .update((self, w) => { w.move(self, w.input.dir * 1.2); });

const Shroom = actor("Shroom").look({ color: "#c6f" })
  .state({ home: ["vec2@px", [0, 0]] })
  .update((self, w) => {
    if (distance(self.pos, w.player.pos) < $.reach * 8) self.pos = self.home + vec2(0, sin(w.time * 4));
  });

const game = tiles("run")
  .screen(COLS * 8, ROWS * 8)
  .tiles({ wall: { color: "#334", solid: true }, floor: { color: "#111" } })
  .map(level.out.cells, { rock: "wall", open: "floor" })
  .spawn(Picker, level.out.spawns, { kind: "start", init: s => ({ pos: tile(s.at) }) })
  .spawn(Shroom, level.out.spawns, { kind: "shroom", init: s => ({ pos: tile(s.at), home: tile(s.at) }) })
  .player(Picker)
  .state({ round: ["int", 0], picked: ["int", 0] })
  .event("picked", { round: "int" })
  .update(w => {
    for (const m of w.touching(w.player, Shroom)) { m.remove(); w.state.picked += 1; w.emit("picked", { round: w.state.round }); }
    const here = cell(w.player.pos);
    if (here.x === level.out.exit.x && here.y === level.out.exit.y) w.state.round += 1;
  })
  .export("player", "vec2@px", w => w.player.pos)
  .export("exit", "vec2@px", w => tile(level.out.exit))
  .export("picked", "int", w => w.state.picked)
  .export("round", "int", w => w.state.round);

const torch = glow("torch")
  .over(game.out.image)
  .sample(game.out.player, "lerp")
  .light(p => {
    const d = distance(p.xy, game.out.player);
    const edge = $.reach * 8 + 4 * noise(p.t * 3, 0);
    const lit = 1 - smoothstep(edge * 0.6, edge, d);
    const beacon = 0.3 * (1 - smoothstep(0, 12, distance(p.xy, game.out.exit)));
    return p.color * (0.08 + lit) + vec3(0.2, 0.9, 0.4) * beacon;
  });

export default program("Spore Run").show(torch);
