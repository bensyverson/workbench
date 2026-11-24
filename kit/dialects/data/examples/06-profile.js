// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 6, as far as the kit builds it: there are no build-time lambdas, so what the Dream Code
// computed from the data's shape is written out. One histogram per numeric column is one `.chart` each
// (`.charts(…)` is B009); the profile is an `agg` with no `groupBy`, one row (`.describe()` is B009); the
// pivot is its long form, grouped by both keys (`.pivot(…)` is B009: its columns come from the data, which
// only a build-time step could read). The grid layout is left out (`.layout` is B009).
import { program } from "../grammar.js";

export default ($) => program("profile")
  .source("survey", { csv: "data/survey.csv", columns: { team: "str", quarter: "str", age: "f64", score: "f64" } })
  .chart("ageHist", "survey")
  .mark("histogram")
  .x("age", { bins: 30 })
  .chart("scoreHist", "survey")
  .mark("histogram")
  .x("score", { bins: 30 })
  .table("profile", "survey")
  .agg({
    n: (g) => g.count(),
    scoreMin: (g) => g.min("score"),
    scoreMax: (g) => g.max("score"),
    scoreMean: (g) => g.mean("score"),
  })
  .table("byQuarter", "survey")
  .groupBy("team", "quarter")
  .agg({ score: (g) => g.mean("score") });
