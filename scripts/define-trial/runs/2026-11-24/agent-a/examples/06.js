// REFUSED: B001 (rejected "charts"): a chart per numeric column needs a build-time lambda (R8).
// The histograms fan-out over the schema and the pivot's `sample(...)` of distinct quarters are
// build-time lambdas, refused. What fits: the profile, as a built-in .describe() step with a fixed
// schema, and the pivot with its quarters written out (`expect`) instead of sampled from the data.
// The view is refused (R8).
import { program } from "../data.grammar.js";

export default program("profile")
  .source("survey", { csv: "data/survey.csv", columns: { team: "str", quarter: "str", score: "f64", tenure: "f64" } })
  .table("profile", "survey")
  .describe()
  .table("byQuarter", "survey")
  .pivot({ rows: "team", cols: "quarter", expect: ["Q1", "Q2", "Q3", "Q4"] }, (g) => g.mean("score"));

// p.table("z", wb.build(({ t, $ }) => t.survey.limit($.n)))  has no form here: there is no build phase
// for a lambda to be in, so E-PHASE has no counterpart.
