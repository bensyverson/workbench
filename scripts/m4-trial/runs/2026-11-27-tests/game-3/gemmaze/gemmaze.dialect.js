import { defineDialect, vector, exact, list, struct, enumOf } from "kit/define";

export const gemmazeDialect = defineDialect({
  name: "gemmaze",
  numberType: "f64",
  types: { cellpos: vector(2, "f64") },
  spaces: { none: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},

  state: {
    cols: "f64",
    rows: "f64",
    player: "cellpos",
    walls: list(struct({ at: "cellpos" }), 400),
    gems: list(struct({ at: "cellpos" }), 400),
    collected: "f64",
    held: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
    dir: enumOf(["none", "up", "down", "left", "right"]),
    wait: "f64",
  },

  text(state) {
    const has = (items, x, y) => items.some((i) => i.at[0] === x && i.at[1] === y);
    const lines = [];
    for (let y = 0; y < state.rows; y++) {
      let line = "";
      for (let x = 0; x < state.cols; x++) {
        if (state.player[0] === x && state.player[1] === y) line += "@";
        else if (has(state.walls, x, y)) line += "#";
        else if (has(state.gems, x, y)) line += "*";
        else line += ".";
      }
      lines.push(line);
    }
    lines.push("gems picked up: " + state.collected + ", left: " + state.gems.length);
    return lines.join("\n");
  },

  frames: {
    cell: {
      dims: 2,
      note: "grid cells: x right, y down, origin at the grid's top-left corner; cell (i, j) spans [i, i+1] by [j, j+1]",
      extent: (record) => ({ min: [0, 0], max: [record.map[0].length, record.map.length] }),
    },
    px: {
      dims: 2,
      note: "picture pixels: x right, y down, origin at the grid's top-left corner; 16 pixels per cell",
      extent: (record) => ({ min: [0, 0], max: [record.map[0].length * 16, record.map.length * 16] }),
    },
  },
  edges: () => [{ from: "cell", to: "px", scale: 16, offset: 0 }],

  colors: { floor: "#1d2230", wall: "#6b7394" },
  images: {
    sprites: { size: [32, 16], cell: [16, 16], file: "sprites.png", note: "cell 0 the player figure, cell 1 a gem" },
  },

  ports: {
    out: {
      picked: {
        seam: "Event<{ at: point2@cell, collected: f64 }>",
        note: "one record per gem picked up: at is the center of the gem's cell, collected the total picked up so far, this one included",
      },
      collected: { seam: "f64", from: "collected", note: "how many gems have been picked up" },
      view: {
        seam: "Draw<402>@px",
        note: "the level: a floor rectangle, the walls, the remaining gems and the player",
        max: (record) => record.map.length * record.map[0].length + 2,
        layers: [
          { from: (s) => ({ op: "rect", at: [0, 0], size: [s.cols * 16, s.rows * 16], fill: "floor" }) },
          { each: "walls", from: (w) => ({ op: "rect", at: [w.at.x * 16, w.at.y * 16], size: [16, 16], fill: "wall" }) },
          { each: "gems", from: (g) => ({ op: "image", at: [g.at.x * 16, g.at.y * 16], image: "sprites", cell: 1 }) },
          { from: (s) => ({ op: "image", at: [s.player.x * 16, s.player.y * 16], image: "sprites", cell: 0 }) },
        ],
      },
    },
    in: {
      pad: {
        seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
        note: "the directions held now: a newly held direction moves the player one cell at once, and holding it repeats the step",
      },
    },
  },
});
