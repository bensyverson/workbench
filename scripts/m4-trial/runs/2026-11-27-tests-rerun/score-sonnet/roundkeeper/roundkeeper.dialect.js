import { defineDialect, exact, opt } from "kit/define";

export const roundkeeperDialect = defineDialect({
  name: "roundkeeper",
  numberType: "f64",
  spaces: { build: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: {
    start: opt("f64"),
    score: "f64",
    left: "f64",
    over: "bool",
    met: "bool",
    fraction: "f64",
    scoreText: "str",
    timeText: "str",
  },
  text(s) { return s.scoreText + "\n" + s.timeText; },
  frames: {
    hud: {
      dims: 2,
      note: "The scoreboard's own pixels: x to the right, y down, origin at its top-left corner. A character is 8 by 8. Layer it at scale 1.",
      extent: () => ({ min: [0, 0], max: [184, 32] }),
    },
  },
  colors: { panel: "#000000b0", ink: "#ffffff", bar: "#4cc2ff", done: "#ffb000", good: "#6ee06e" },
  ports: {
    out: {
      score: { seam: "f64", from: "score", note: "Points scored in this round so far: the number of events counted times the Program's worth. Held once the round is over." },
      left: { seam: "f64@s", from: "left", note: "Seconds left in the round, from the round's length down to 0." },
      over: { seam: "bool", from: "over", note: "True once the time is up. From then on events do not count and the score does not change." },
      met: { seam: "bool", from: "met", note: "True once the score has reached the Program's goal; always false for a Program with no goal." },
      view: {
        seam: "Draw<8>@hud",
        note: "The scoreboard, 184 by 32: a translucent panel, the label and score, the time left and a time bar. Meant to be drawn over another picture.",
        from: (s) => [
          { op: "rect", at: [0, 0], size: [184, 32], fill: "panel" },
          { op: "text", at: [4, 3], str: s.scoreText, font: "mono", fill: s.met ? "good" : "ink" },
          { op: "text", at: [4, 14], str: s.timeText, font: "mono", fill: s.over ? "done" : "ink" },
          { op: "rect", at: [4, 26], size: [176 * s.fraction, 3], fill: "bar" },
        ],
      },
    },
    in: {
      scored: {
        seam: "Event<{}>",
        note: "Each record is one scoring event, worth the Program's points; any fields a producer sends are ignored. A record sent once the time is up does not count.",
        delivery: "reliable",
      },
    },
  },
});
