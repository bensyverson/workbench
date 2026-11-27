import { defineDialect, vector, exact, enumOf, list, struct } from "kit/define";

export const gemgridDialect = defineDialect({
  name: "gemgrid",
  numberType: "f64",
  types: { spot: vector(2, "f64") },
  spaces: { build: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: {
    width: "f64",
    height: "f64",
    walls: list("spot", 576),
    gems: list("spot", 576),
    player: "spot",
    picked: "f64",
    total: "f64",
    moves: "f64",
    held: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
    heading: enumOf(["none", "up", "down", "left", "right"]),
    waited: "f64",
  },
  text(s) {
    const rows = [];
    for (let y = 0; y < s.height; y++) rows.push(new Array(s.width).fill("."));
    const put = (p, c) => { rows[Math.floor(p[1])][Math.floor(p[0])] = c; };
    for (const w of s.walls) put(w, "#");
    for (const g of s.gems) put(g, "*");
    put(s.player, "P");
    return `${rows.map((r) => r.join("")).join("\n")}\ngems ${s.picked}/${s.total}, moves ${s.moves}`;
  },
  frames: {
    cell: {
      dims: 2,
      note: "The level's grid: one unit is one cell, origin at the grid's top-left corner, x right, y down. A cell's center is at (column + 0.5, row + 0.5).",
      extent: (record) => ({ min: [0, 0], max: [record.map[0].length, record.map.length] }),
    },
    px: {
      dims: 2,
      note: "The picture's pixels: 16 per cell, origin at the grid's top-left corner, x right, y down.",
      extent: (record) => ({ min: [0, 0], max: [record.map[0].length * 16, record.map.length * 16] }),
    },
  },
  edges: () => [{ from: "cell", to: "px", scale: 16, offset: 0 }],
  colors: { floor: "#1d2230", wall: "#6b7280" },
  images: {
    sprites: { size: [32, 16], cell: [16, 16], file: "sprites.png", note: "Cell 0 is the player figure, cell 1 a gem." },
  },
  ports: {
    out: {
      picked: {
        seam: "Event<{ at: point2@cell }>",
        note: "One record for each gem the player picks up; at is the center of the gem's cell.",
      },
      score: { seam: "f64", from: "picked", note: "How many gems have been picked up since the level started (a count)." },
      player: { seam: "point2@cell", from: "player", note: "The center of the cell the player stands in." },
      view: {
        seam: "Draw<1154>@px",
        note: "The whole level: floor, walls, the gems still there, then the player on top.",
        max: (record) => 2 + record.map.length * record.map[0].length,
        layers: [
          { from: (s) => ({ op: "rect", at: [0, 0], size: [s.width * 16, s.height * 16], fill: "floor" }) },
          { each: "walls", from: (w) => ({ op: "rect", at: [w.x * 16 - 8, w.y * 16 - 8], size: [16, 16], fill: "wall" }) },
          { each: "gems", from: (g) => ({ op: "image", at: [g.x * 16 - 8, g.y * 16 - 8], image: "sprites", cell: 1 }) },
          { from: (s) => ({ op: "image", at: [s.player.x * 16 - 8, s.player.y * 16 - 8], image: "sprites", cell: 0 }) },
        ],
      },
    },
    in: {
      move: {
        seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
        note: "The D-pad: each record is the set of directions held from then on. A newly pressed direction moves one cell at once; holding it repeats at the level's pace. Walls and the grid's edge block.",
        delivery: "reliable",
      },
    },
  },
});
