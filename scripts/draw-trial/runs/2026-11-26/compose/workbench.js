import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";
import { arcade } from "arcade";

const SPEED = 45;
const GRAVITY = 60;

export default ($) => {
  // 20 by 16 cells: 160 by 128 of the maze's picture, leaving one 8-unit line above and below for the HUD.
  const dungeon = maze("dungeon")
    .grid([
      "####################",
      "#........#.........#",
      "#.##.###.#.###.##c.#",
      "#.#....#...#.....#.#",
      "#.#.c..#.###..c..#.#",
      "#......#.....###...#",
      "####.#####.#.....###",
      "#....c.....#..c....#",
      "#.##.###.#####.###.#",
      "#.#......#.........#",
      "#.#.####.#.##.####.#",
      "#...#c.....#.....c.#",
      "#.###.####.#.###.#.#",
      "#.....#......#...#.#",
      "#..c..#..c...#.....#",
      "####################",
    ])
    .start({ x: 1, y: 7 })
    .tick(1 / 8)
    .control((pl, pad) => {
      pl.dx = 0;
      pl.dy = 0;
      if (pad.left) pl.dx = -1;
      else if (pad.right) pl.dx = 1;
      else if (pad.up) pl.dy = -1;
      else if (pad.down) pl.dy = 1;
      pl.steps = pad.left || pad.right || pad.up || pad.down ? 1 : 0;
    });

  const sparks = particles("sparks")
    .bounds({ width: 160, height: 144 })
    .maxParticles(400)
    .tick(1 / 30)
    .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, GRAVITY) * dt; })
    .update((p, dt) => { p.size = Math.max(1, 4 * (1 - p.age / p.life)); })
    .emitter("pop", { x: 80, y: 72, maxRate: 0, forces: ["fall"], trigger: "burst", perEvent: 60 })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        const a = rng() * 2 * Math.PI;
        p.pos = ev.at;
        p.vel = vec2(Math.cos(a), Math.sin(a)) * SPEED * (0.3 + rng());
        p.life = 0.6 + rng() * 0.5;
        p.size = 4;
      });

  const screen = arcade("screen")
    .screen({ width: 160, height: 144 })
    .title("MAZE");

  return compose("arcade-maze")
    .part(dungeon)
    .part(sparks)
    .part(screen)
    .frame(dungeon.frame.pixel, screen.frame.screen, "fit")
    .frame(sparks.frame.px, screen.frame.screen, "fit")
    .wire(dungeon.out.coin, sparks.in.burst, { rename: { cell: "at" } })
    .wire(dungeon.out.view, screen.in.board)
    .wire(sparks.out.view, screen.in.effects)
    .wire(dungeon.out.score, screen.in.score)
    .wire(dungeon.out.coinsLeft, screen.in.coinsLeft)
    .show(screen);
};
