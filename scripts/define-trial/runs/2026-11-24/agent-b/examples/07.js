// REFUSED: B001 (rejected "fragment"): fragments that add methods or column attributes are not part of the draft (rules R8).
//   "fragments (new methods or attributes on a construct) are not supported"
// What follows is the Program the fragments would have expanded to, written out by hand with
// winsorize's defaults (lo 0.01, hi 0.99). The column attributes (currency, unit) and chart.rule have no form.
import { program } from "../data.grammar.js";

// The per-table statistics (quantiles, mean, sd) are a one-group aggregate joined back
// on a constant key: there is no "groupBy nothing" and no cross join, and a row
// lambda cannot read another table's value.
export default program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "string", units: "number", price: "number", weight: "number" } })
  .table("keyed", "sales")
    .derive("k", "number", (row) => 0)
  .table("bounds", "keyed")
    .groupBy("k")
    .agg("lo", "number", (g) => g.quantile("price", 0.01))
    .agg("hi", "number", (g) => g.quantile("price", 0.99))
  .table("winsorized", "keyed")
    .join("bounds", { on: "k", take: ["lo", "hi"] })
    .derive("price", "number", (row) => clamp(row.price, row.lo, row.hi))
  .table("stats", "winsorized")
    .groupBy("k")
    .agg("mean", "number", (g) => g.mean("price"))
    .agg("sd", "number", (g) => g.sd("price"))
  .table("clean", "winsorized")
    .join("stats", { on: "k", take: ["mean", "sd"] })
    .derive("price_z", "number", (row) => (row.price - row.mean) / row.sd)
    .select("date", "region", "units", "price", "weight", "price_z")
  .chart("dist", "clean", "histogram")
    .x("price_z");

// REFUSED: B001 (rejected "rule" on chart): .rule(3, { label: "3σ" }) was a chart fragment.
// The two diagnostics of the Dream Code (winsorise → winsorize from a fragment; currency "YEN") have
// no counterpart: there are no fragments, and no column attributes to check a value against.
