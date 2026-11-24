// REFUSED: B001 (rejected "listing"): the IR, listing, lineage, downstreamOf and diff belong to the
// built record and the kit, not to the builder. The draft says .build() returns plain data and nothing
// about lineage or diffs. What fits: the "next" version of example 4 that the diff compares,
// with the added filter as a step of a second table (a table cannot be reopened to append a step).
import { program } from "../data.grammar.js";

export default program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "str", region: "str", units: "f64", price: "f64" } })
  .param("metric", { options: ["revenue", "units"], value: "revenue" })
  .table("monthly", "sales")
  .derive("revenue", "f64", (row) => row.units * row.price)
  .derive("month", "str", (row) => truncMonth(row.date))
  .groupBy("month", "region")
  .agg("revenue", "f64", (g) => g.sum("revenue"))
  .agg("units", "f64", (g) => g.sum("units"))
  .agg("orders", "f64", (g) => g.count())
  .sort("month")
  .table("monthlyKept", "monthly")
  .filter((r) => r.units > 0)
  .chart("trend", "monthlyKept", "line")
  .x({ field: "month", type: "time" })
  .y({ param: "metric" })
  .color("region");
