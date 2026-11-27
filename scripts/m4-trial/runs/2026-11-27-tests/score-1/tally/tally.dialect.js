import { defineDialect, exact, opt } from "kit/define";

export const tallyDialect = defineDialect({
  name: "tally",
  numberType: "f64",
  spaces: { build: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: {
    title: "str",
    seconds: "f64",
    worth: "f64",
    goal: "f64",
    start: opt("f64"),
    score: "f64",
    left: "f64",
    shown: "f64",
    over: "bool",
  },
  frames: {
    card: {
      dims: 2,
      note: "the score card's own units: origin at its top-left corner, x right, y down; 160 wide by 40 tall",
      extent: () => ({ min: [0, 0], max: [160, 40] }),
    },
  },
  colors: { back: "#000000b0", ink: "#ffffff", accent: "#ffd23f", dim: "#808080" },
  ports: {
    in: {
      scored: {
        seam: "Event<{ points: f64 = 1 }>",
        delivery: "reliable",
        note: "one record is one scoring event: the score goes up by points times the Program's worth (points is 1 when the producer has no such field; 0 or less adds nothing; the score is kept to thousandths). A record stamped at or after the end of the round does not count",
      },
    },
    out: {
      score: { seam: "f64", from: "score", note: "the score so far; it no longer changes once the round is over" },
      left: { seam: "f64@s", from: "left", note: "seconds left in the round, from the Program's length down to 0" },
      over: { seam: "bool", from: "over", note: "true once the time is up, and from then on" },
      view: {
        seam: "Draw<8>@card",
        note: "a small score card to lay over another picture: a translucent panel, the title, the score (and goal), the seconds left, and a bar that shrinks with the time",
        layers: [
          { from: (s) => [
            { op: "rect", at: [0, 0], size: [160, 40], fill: "back" },
            { op: "text", at: [4, 3], str: s.title, font: "mono", fill: "accent" },
            { op: "text", at: [4, 14], str: s.goal > 0 ? "SCORE " + s.score + "/" + s.goal : "SCORE " + s.score, font: "mono", fill: s.goal > 0 && s.score >= s.goal ? "accent" : "ink" },
            { op: "text", at: [4, 25], str: s.over ? "TIME UP" : "TIME " + s.shown, font: "mono", fill: "ink" },
            { op: "rect", at: [4, 35], size: [152, 3], fill: "dim" },
            { op: "rect", at: [4, 35], size: [152 * s.left / s.seconds, 3], fill: "accent" },
          ] },
        ],
      },
    },
  },
  text(state) {
    return `${state.title} score ${state.score}${state.goal > 0 ? "/" + state.goal : ""} time left ${state.shown}s${state.over ? " OVER" : ""}`;
  },
});
