import { defineDialect, exact, opt } from "kit/define";

export const tallyDialect = defineDialect({
  name: "tally",
  numberType: "f64",
  spaces: { build: { pure: true } },
  objects: { Math: { label: "Math", members: {
    round: { fn: { params: ["f64"], returns: "f64" } },
    ceil: { fn: { params: ["f64"], returns: "f64" } },
    min: { fn: { params: ["f64", "f64"], returns: "f64" } },
    max: { fn: { params: ["f64", "f64"], returns: "f64" } },
  } } },
  globals: { Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: {
    score: "f64",
    left: "f64",
    over: "bool",
    start: opt("f64"),
    label: "str",
    goal: "f64",
  },
  frames: {
    panel: {
      dims: 2,
      note: "the scoreboard's own pixels: x right, y down, origin at its top left corner; 128 by 28",
      extent: (record) => ({ min: [0, 0], max: [128, 28] }),
    },
  },
  colors: { ink: "#ffffff", back: "#101020c0", good: "#60e060", bar: "#f0c040" },
  ports: {
    out: {
      score: { seam: "f64", from: "score", note: "the round's score: each counted record's points times the Program's worth, summed; unchanged once the round is over" },
      left: { seam: "f64@s", from: "left", note: "seconds left in the round, from its full length down to 0, updated every 0.1 s" },
      over: { seam: "bool", from: "over", note: "true once the time is up; it stays true" },
      view: {
        seam: "Draw<4>@panel",
        note: "the scoreboard: a backing box, the label and score, the time left (or TIME UP) and a bar that shrinks with it; green score once the goal is reached",
        from: (s, record) => [
          { op: "rect", at: [0, 0], size: [128, 28], fill: "back" },
          { op: "text", at: [2, 2], str: s.label + " " + Math.round(s.score * 100) / 100, font: "mono", fill: s.goal > 0 && s.score >= s.goal ? "good" : "ink" },
          { op: "text", at: [2, 12], str: s.over ? "TIME UP" : "TIME " + Math.ceil(s.left), font: "mono", fill: "ink" },
          { op: "rect", at: [2, 23], size: [Math.max(0, Math.min(1, s.left / record.seconds)) * 124, 3], fill: "bar" },
        ],
      },
    },
    in: {
      scored: {
        seam: "Event<{ points: f64 = 1 }>",
        note: "each record is one scoring event, worth `points` times the Program's worth (1 point when the producer has no such field; negative takes score away); a record sent at or after the end of the round does not count",
      },
    },
  },
  text(state) {
    return state.label + " " + state.score + (state.goal > 0 ? " / " + state.goal : "") +
      (state.over ? "  TIME UP" : "  TIME " + Math.ceil(state.left));
  },
});
