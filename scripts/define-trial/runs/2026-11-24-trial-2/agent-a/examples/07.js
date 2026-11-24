import { program } from "../data.grammar.js";

// The part that fits: winsorize and zscore written out as derive steps, bounds and stats as params.
export default program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("lo", { value: 1, min: 0, max: 100 })
  .param("hi", { value: 99, min: 0, max: 100 })
  .param("mean", { value: 10 })
  .param("sd", { value: 2 })
  .table("clean", "sales")
  .derive("price", row => min(max(row.price, $.lo), $.hi))
  .derive("price_z", row => (row.price - $.mean) / $.sd)
  .chart("dist", "clean")
  .mark("histogram")
  .x("price_z")
  .rule(3, { label: "3 sigma" });
// REFUSED (part): wb.fragment("table"|"column"|"chart", ...) (program.fragment(...) would be B009), this.quantiles at
// build time, per-column attributes (table.column(...) would be B009).
