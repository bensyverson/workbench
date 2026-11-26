import { defineDialect, exact } from "kit/define";

// The arcade: a root that shows two pictures it is handed, one over the other, with a line of HUD text on top.
export const arcadeDialect = defineDialect({
  name: "arcade",
  numberType: "f64",
  spaces: { none: { pure: true } },
  objects: { In: { label: "the inputs (inp)", members: {} } },
  globals: { inp: "In" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { unused: { params: [], returns: "f64", space: "none" } },
  state: { score: "f64" },
  colors: { ink: "#f1faee" },
  frames: {
    screen: {
      dims: 2,
      note: "pixels of the page; x to the right, y down; (0, 0) is the top-left corner",
      extent: (record) => ({ min: [0, 0], max: [record.screen.width, record.screen.height] }),
    },
  },
  ports: {
    in: {
      board: { seam: "Draw<8193>@screen", note: "the picture drawn first, underneath" },
      fx: { seam: "Draw<10000>@screen", note: "the picture drawn over the board" },
      score: { seam: "f64", default: 0, note: "the number the HUD shows" },
    },
    out: {
      view: {
        seam: "Draw<18194>@screen",
        note: "the page: the board, then the effects over it, then the HUD's score at the top left",
        from: (s, i) => [...i.board, ...i.fx, { op: "text", at: [4, 4], str: "SCORE " + s.score, font: "mono", fill: "ink" }],
      },
    },
  },
  inputs: { object: "In", name: "inp" },
  text: (s) => `score ${s.score}`,
});
