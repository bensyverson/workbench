import { program } from "../data.grammar.js";

// Only the hand-written part fits: the source, and the histograms the
// build-time fan-out would have made, one per numeric column the author knows of.
export default program("profile")
  .source("survey", { csv: "data/survey.csv", columns: { team: "string", quarter: "string", score: "number", tenure: "number" } })
  .chart("scoreHist", "survey", "histogram")
    .x("score", { bins: 30 })
    .title("score")
  .chart("tenureHist", "survey", "histogram")
    .x("tenure", { bins: 30 })
    .title("tenure");

// REFUSED: B001 (rejected "charts"): .charts("histograms", wb.build(({ schema, t }) => …)) fans out over the schema
//   at build time; rules R8 rule out build-time lambdas. Written out by hand above instead.
// REFUSED: (no code) .table("profile", wb.build(({ t }) => t.survey.describe())): a per-column profile is a
//   table whose rows are the source's columns. No table method turns columns into rows, and a
//   build-time lambda is ruled out (R8). The builder would answer B003 for a function where ref("table") wants a name.
// REFUSED: (no code) the byQuarter pivot: its columns come from the data's distinct values, which
//   environment() cannot see (it gets the record, not the data), so the row type after a pivot is unknown.
// The E-PHASE example (a build-time lambda reading a param) has no counterpart: there is no build phase to read from.
