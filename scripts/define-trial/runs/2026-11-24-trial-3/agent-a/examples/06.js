import { program } from "../data.grammar.js";

// REFUSED: B009 for .charts(…) and the build-time lambdas: "build-time fan-out is not a grammar call".
// What fits: the survey's schema is declared in this file, so the Program's own function loops over it
// and opens one histogram per numeric column (build-time code, not a build-time lambda). The profile is a
// runtime step (.describe()), not a static table computed once at build. The pivot's quarters cannot come
// from a sample of the data: the author writes them out in `expect`. The view (a 2-column grid) is layout,
// refused by .view (B009). The phase error (a build-time lambda reading a runtime param) has no counterpart:
// a param read by build-time code is folded at build, so no such error exists.
const SURVEY = { team: "str", quarter: "str", score: "f64", age: "f64", tenure: "f64" };

export default ($) => {
  let p = program("profile").source("survey", { csv: "data/survey.csv", columns: SURVEY });
  for (const [c, t] of Object.entries(SURVEY)) {
    if (t === "f64") p = p.chart(`hist_${c}`, "histogram", "survey").x(c, { bins: 30 }).title(c);
  }
  return p
    .table("profile", "survey")
    .describe()
    .table("byQuarter", "survey")
    .pivot({ rows: "team", cols: "quarter", values: (g) => g.mean("score"), expect: ["Q1", "Q2", "Q3", "Q4"] });
};
