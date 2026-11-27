import { defineDialect, exact, opt } from "kit/define";

export const scoretimerDialect = defineDialect({
  name: "scoretimer",
  numberType: "f64",
  types: {},
  spaces: { host: { pure: true } },
  objects: {
    Math: { label: "Math", members: {
      max: { fn: { params: ["f64", "f64"], returns: "f64" } },
      ceil: { fn: { params: ["f64"], returns: "f64" } },
    } },
  },
  globals: { Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: { score: "f64", left: "f64", over: "bool", start: opt("f64"), duration: "f64", target: "f64", worth: "f64", label: "str" },
  text(s) {
    const lines = [];
    if (s.label !== "") lines.push(s.label);
    lines.push("score " + s.score + (s.target > 0 ? " of " + s.target : ""));
    lines.push(s.over ? "round over" : "time left " + Math.ceil(s.left - 0.000001) + " s");
    return lines.join("\n");
  },
  frames: {
    panel: {
      dims: 2,
      note: "The score panel, 160 wide by 24 tall; origin at its top-left, x right, y down. One unit is one pixel of the 8-unit font.",
      extent: () => ({ min: [0, 0], max: [160, 24] }),
    },
  },
  colors: { back: "#000000c0", ink: "#ffffff", good: "#66dd66", bar: "#ffcc33" },
  ports: {
    out: {
      score: { seam: "f64", from: "score", note: "The score so far, in points. It starts at 0, never goes down, and stops changing when the round is over." },
      timeLeft: { seam: "f64@s", from: "left", note: "Seconds left in the round, from the Program's length down to 0." },
      over: { seam: "bool", from: "over", note: "True once the time is up; it stays true." },
      view: {
        seam: "Draw<8>@panel",
        note: "The panel: a translucent backing, the label, the score (and target), the seconds left or OVER, and a bar of the time left. Layer it over another picture.",
        max: () => 5,
        layers: [
          { from: (s) => [
            { op: "rect", at: [0, 0], size: [160, 24], fill: "back" },
            { op: "text", at: [2, 2], str: s.label, font: "mono", fill: "ink" },
            { op: "text", at: [2, 12], str: s.target > 0 ? "" + s.score + "/" + s.target : "SCORE " + s.score, font: "mono", fill: s.target > 0 && s.score >= s.target ? "good" : "ink" },
            { op: "text", at: [110, 12], str: s.over ? "OVER" : "T " + Math.ceil(s.left - 0.000001), font: "mono", fill: "ink" },
            { op: "rect", at: [0, 22], size: [160 * s.left / s.duration, 2], fill: "bar" },
          ] },
        ],
      },
    },
    in: {
      scored: {
        seam: "Event<{ points: f64 = 1 }>",
        note: "One record is one scoring event: while the round runs, the score goes up by the whole part of points times the Program's worth. A producer with no points field counts as 1; points of 0 or less add nothing. Records sent at or after the end are ignored.",
      },
    },
  },
});
