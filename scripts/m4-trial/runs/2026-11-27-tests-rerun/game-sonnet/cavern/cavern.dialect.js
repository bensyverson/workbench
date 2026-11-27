import { defineDialect, vector, list, struct, exact } from "kit/define";

export const cavernDialect = defineDialect({
  name: "cavern",
  numberType: "f64",
  types: { v2: vector(2, "f64") },
  spaces: { build: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: {
    w: "f64",
    h: "f64",
    walls: list("v2", 300),
    gems: list("v2", 300),
    player: "v2",
    collected: "f64",
    held: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
  },
  text(state) {
    const has = (items, x, y) => items.some((p) => p[0] === x && p[1] === y);
    const lines = [];
    for (let y = 0; y < state.h; y++) {
      let line = "";
      for (let x = 0; x < state.w; x++) {
        if (state.player[0] === x && state.player[1] === y) line += "@";
        else if (has(state.walls, x, y)) line += "#";
        else line += has(state.gems, x, y) ? "*" : ".";
      }
      lines.push(line);
    }
    return lines.join("\n") + "\ngems picked up: " + state.collected + ", left: " + state.gems.length;
  },
  frames: {
    cell: {
      dims: 2,
      note: "grid cells: x right, y down, origin at the level's top-left corner; one unit is one cell, so the center of column c, row r is [c + 0.5, r + 0.5]",
      extent: (record) => ({ min: [0, 0], max: [record.rows[0].length, record.rows.length] }),
    },
    px: {
      dims: 2,
      note: "picture pixels: x right, y down, origin at the level's top-left corner; 16 pixels per cell",
      extent: (record) => ({ min: [0, 0], max: [record.rows[0].length * 16, record.rows.length * 16] }),
    },
  },
  edges: () => [{ from: "cell", to: "px", scale: 16, offset: 0 }],
  colors: { floor: "#2b2b3a", wall: "#8a7f72" },
  images: { sprites: { size: [32, 16], cell: [16, 16], file: "sprites.png", note: "cell 0 the player, cell 1 a gem" } },
  ports: {
    out: {
      picked: { seam: "Event<{ at: point2@cell }>", note: "one record per gem picked up; at is the center of the gem's cell" },
      collected: { seam: "f64", from: "collected", note: "how many gems have been picked up so far" },
      remaining: { seam: "f64", from: (s) => s.gems.length, note: "how many gems are still on the level; 0 when all are picked up" },
      player: { seam: "point2@cell", from: (s) => [s.player.x + 0.5, s.player.y + 0.5], note: "the center of the cell the player stands in" },
      view: {
        seam: "Draw<302>@px",
        note: "the whole level: floor, walls, remaining gems and the player",
        max: (record) => record.rows.length * record.rows[0].length + 2,
        layers: [
          { from: (s) => [{ op: "rect", at: [0, 0], size: [s.w * 16, s.h * 16], fill: "floor" }] },
          { each: "walls", from: (p) => ({ op: "rect", at: [p.x * 16, p.y * 16], size: [16, 16], fill: "wall" }) },
          { each: "gems", from: (p) => ({ op: "image", at: [p.x * 16, p.y * 16], image: "sprites", cell: 1 }) },
          { from: (s) => ({ op: "image", at: [s.player.x * 16, s.player.y * 16], image: "sprites", cell: 0 }) },
        ],
      },
    },
    in: {
      move: {
        seam: "Event<{ up: bool = false, down: bool = false, left: bool = false, right: bool = false }>",
        note: "which directions are held now; each direction that turns from not held to held moves the player one cell that way unless a wall is there. At most one move per record (up, down, left, right in that order)",
      },
    },
  },
});
