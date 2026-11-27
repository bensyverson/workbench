import { defineDialect, exact, list, struct } from "kit/define";

// A level is rows of characters (see gridgame.grammar.js). The run's state keeps
// every cell, the player, the number of gems picked up, and the directions held now.
export const gridgame = defineDialect({
  name: "gridgame",
  numberType: "f64",

  spaces: { pure: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},

  frames: {
    cell: {
      dims: 2,
      note: "grid cells: x to the right, y down; the top-left cell is (0, 0)",
    },
    px: {
      dims: 2,
      note: "picture pixels, one unit a pixel, y down; the top-left of the level is (0, 0)",
      extent: (record) => ({
        min: [0, 0],
        max: [record.row[0].length * 16, record.row.length * 16],
      }),
    },
  },

  colors: {
    wall: "#3b3b4f",
    floor: "#1c1c26",
  },

  images: {
    tiles: {
      size: [32, 16],
      cell: [16, 16],
      file: "sprites.png",
      note: "cell 0 is the figure (the player), cell 1 is a gem",
    },
  },

  state: {
    cells: list(struct({ x: "f64", y: "f64", wall: "bool", gem: "bool" }), 400),
    player: struct({ x: "f64", y: "f64" }),
    picked: "f64",
    held: struct({ up: "bool", down: "bool", left: "bool", right: "bool" }),
  },

  ports: {
    out: {
      view: {
        seam: "Draw<1000>@px",
        note: "the level: walls and floor, the gems not yet picked up, and the player",
        layers: [
          {
            each: "cells",
            from: (c) =>
              c.wall
                ? { op: "rect", at: [c.x * 16, c.y * 16], size: [16, 16], fill: "wall" }
                : { op: "rect", at: [c.x * 16, c.y * 16], size: [16, 16], fill: "floor" },
          },
          {
            each: "cells",
            from: (c) =>
              c.gem ? { op: "image", at: [c.x * 16, c.y * 16], image: "tiles", cell: 1 } : null,
          },
          {
            pen: (s, pen) => {
              pen.image({ at: [s.player.x * 16, s.player.y * 16], image: "tiles", cell: 0 });
            },
            max: 1,
          },
        ],
      },
      pickup: {
        seam: "Event<{ at: point2@cell }>",
        note: "one record each time the player walks onto a gem: the cell it was picked up in",
      },
      picked: {
        seam: "f64",
        from: "picked",
        note: "how many gems the player has picked up so far",
      },
    },
    in: {
      steer: {
        seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
        note: "the directions held now, sent each time one changes; a direction that becomes held moves the player one cell",
        delivery: "reliable",
      },
    },
  },

  text(state) {
    const w = state.cells.length ? Math.max(...state.cells.map((c) => c.x)) + 1 : 0;
    const h = state.cells.length ? Math.max(...state.cells.map((c) => c.y)) + 1 : 0;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let line = "";
      for (let x = 0; x < w; x++) {
        const c = state.cells[y * w + x];
        line += state.player.x === x && state.player.y === y ? "@" : c.wall ? "#" : c.gem ? "*" : ".";
      }
      rows.push(line);
    }
    return rows.join("\n") + `\npicked: ${state.picked}`;
  },
});
