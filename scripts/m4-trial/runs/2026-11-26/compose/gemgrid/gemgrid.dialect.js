import { defineDialect, vector, list, struct, enumOf, exact } from "kit/define";

// A level is at most 20 by 15 cells; a cell is 16 pixels square.
const CELLS = 300;
const DIRS = enumOf(["none", "up", "down", "left", "right"]);
const count = (record, chars) =>
  record.map.join("").split("").filter((c) => chars.includes(c)).length;
const width = (record) => record.map[0].length;
const height = (record) => record.map.length;

export const gemgridDialect = defineDialect({
  name: "gemgrid",
  numberType: "f64",
  types: { v2: vector(2, "f64") },
  spaces: { build: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},

  state: {
    width: "f64",
    height: "f64",
    rows: list("str", 15),
    walls: list(struct({ at: "v2" }), CELLS),
    gems: list(struct({ at: "v2" }), CELLS),
    player: "v2",
    collected: "f64",
    held: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
    moving: DIRS,
    wait: "f64",
  },

  text(s) {
    const lines = s.rows.map((row, y) =>
      row.split("").map((c, x) => {
        if (s.player[0] === x && s.player[1] === y) return "P";
        if (c === "#") return "#";
        return s.gems.some((g) => g.at[0] === x && g.at[1] === y) ? "*" : ".";
      }).join(""));
    return [...lines, `gems picked up: ${s.collected}, left: ${s.gems.length}`].join("\n");
  },

  frames: {
    cell: {
      dims: 2,
      note: "grid cells: x right, y down, origin at the level's top-left corner; column c, row r covers c..c+1 by r..r+1",
      extent: (record) => ({ min: [0, 0], max: [width(record), height(record)] }),
    },
    px: {
      dims: 2,
      note: "picture pixels: x right, y down, origin at the level's top-left corner; 16 pixels a cell",
      extent: (record) => ({ min: [0, 0], max: [width(record) * 16, height(record) * 16] }),
    },
  },
  edges: () => [{ from: "cell", to: "px", scale: 16, offset: 0 }],

  colors: { floor: "#1d2433", wall: "#6b7a99" },
  images: {
    sprites: { size: [32, 16], cell: [16, 16], file: "sprites.png", note: "cell 0 the player figure, cell 1 a gem" },
  },

  ports: {
    out: {
      picked: {
        seam: "Event<{ at: point2@cell, collected: f64 }>",
        note: "one record per gem picked up: at is the center of the gem's cell, collected the number picked up so far, this one included",
      },
      collected: { seam: "f64", from: "collected", note: "gems picked up so far" },
      remaining: { seam: "f64", from: (s) => s.gems.length, note: "gems still on the level; 0 when all are picked up" },
      player: { seam: "point2@cell", from: (s) => [s.player.x + 0.5, s.player.y + 0.5], note: "the center of the player's cell" },
      view: {
        seam: "Draw<302>@px",
        note: "the level: a floor rect, wall rects, gem sprites, then the player sprite on top",
        max: (record) => count(record, "#*") + 2,
        layers: [
          { from: (s) => ({ op: "rect", at: [0, 0], size: [s.width * 16, s.height * 16], fill: "floor" }) },
          { each: "walls", from: (w) => ({ op: "rect", at: [w.at.x * 16 + 1, w.at.y * 16 + 1], size: [14, 14], fill: "wall" }) },
          { each: "gems", from: (g) => ({ op: "image", at: [g.at.x * 16, g.at.y * 16], image: "sprites", cell: 1 }) },
          { from: (s) => ({ op: "image", at: [s.player.x * 16, s.player.y * 16], image: "sprites", cell: 0 }) },
        ],
      },
    },
    in: {
      pad: {
        seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
        note: "the directions held, sent when they change: a newly held one moves the player one cell at once, and keeps moving it while held",
        delivery: "reliable",
      },
    },
  },
});
