// REFUSED: B009 ".charts" is rejected: "a chart per column needs a build-time lambda over the schema";
// the wb.build tables (describe, pivot) are rejected on table (B009 too). Build-time lambdas are outside
// the API (rule R8). What fits is one hand-declared histogram, below.
import { program } from "../data.grammar.js";

export default program("profile")
  .source("survey", { csv: "data/survey.csv", columns: { team: "str", quarter: "str", score: "f64" } })
  .chart("h_score", "survey", "histogram")
  .x("score", { bins: 30 })
  .title("score")
  .view("h_score");
