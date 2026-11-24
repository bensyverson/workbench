// REFUSED: no code. built.ir, listing(), lineage(), downstreamOf(), diff() and toJSON() read the built
// Program, not the builder; the Definition API has no output side for them. The checker has no
// diagnostic for a missing feature. Only the Program of example 4 (which this example builds) is below.
import { program } from "../data.grammar.js";

export default program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("metric", { options: ["revenue", "units"], value: "revenue" })
  .table("monthly", "sales")
  .derive("revenue", row => row.units * row.price)
  .derive("month", row => truncMonth(row.date))
  .groupBy("month", "region")
  .agg({
    revenue: g => g.sum("revenue"),
    units: g => g.sum("units"),
    orders: g => g.count(),
  })
  .sort("month")
  .table("monthly_pos", "monthly")
  .filter(r => r.units > 0)
  .chart("trend", "monthly_pos", "line")
  .x("month", { type: "time" })
  .yBy(() => $.metric)
  .color("region");
