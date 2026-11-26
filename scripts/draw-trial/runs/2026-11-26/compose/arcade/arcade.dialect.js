import { defineDialect, exact } from "kit/define";

// The HUD's text cell: every renderer's font is 8 by 8 units.
const LINE = 8;

// An arcade screen: a board's picture, effects over it, and a HUD of a title, the score and the coins left.
export const arcadeDialect = defineDialect({
  name: "arcade",
  numberType: "f64",
  spaces: { screen: { pure: true } },
  objects: {
    // The kit fills it with one member per value input.
    Wired: { label: "the inputs (wired)", members: {} },
  },
  inputs: { object: "Wired", name: "wired" },
  globals: { wired: "Wired" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: { title: "str", width: "f64", height: "f64", score: "f64", coinsLeft: "f64" },
  colors: { backdrop: "#000000", ink: "#ffffff" },
  frames: {
    screen: {
      dims: 2,
      note: "the arcade screen in pixels; x right, y down; (0, 0) is its top-left corner. The top and bottom 8 units carry the HUD",
      extent: (record) => ({ min: [0, 0], max: [record.screen.width, record.screen.height] }),
    },
  },
  ports: {
    in: {
      board: { seam: "Draw<1025>@screen", note: "the playfield's picture, drawn first, in screen" },
      effects: { seam: "Draw<10000>@screen", note: "effects drawn over the playfield, in screen" },
      score: { seam: "f64", default: 0, note: "the score the HUD shows" },
      coinsLeft: { seam: "f64", default: 0, note: "the coins left, as the HUD shows them" },
    },
    out: {
      view: {
        seam: "Draw<11029>@screen",
        note: "the whole screen, in screen: a backdrop, the board, the effects over it, and the HUD on top (title and score above, coins left below)",
        from: (s, layers) => [
          { op: "rect", at: [0, 0], size: [s.width, s.height], fill: "backdrop" },
          ...layers.board,
          ...layers.effects,
          { op: "text", at: [0, 0], str: s.title, font: "mono", fill: "ink" },
          { op: "text", at: [s.width / 2, 0], str: "SCORE " + s.score, font: "mono", fill: "ink" },
          { op: "text", at: [0, s.height - LINE], str: "COINS LEFT " + s.coinsLeft, font: "mono", fill: "ink" },
        ],
      },
    },
  },
  text(state) {
    return `${state.title} score=${state.score} coins=${state.coinsLeft}`;
  },
});
