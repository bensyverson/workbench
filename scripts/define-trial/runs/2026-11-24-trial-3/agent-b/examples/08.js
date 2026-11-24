import { program } from "../data.grammar.js";

// REFUSED: partly. built.ir, listing(), lineage(), downstreamOf() and diff() are tooling over the
// record and the lowered result, not Programs, so the language has nothing to write for them.
// What fits is the Program they inspect (example 4) plus the "next" version with the extra filter.
export default ($) => program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("monthly", "sales")
  .derive("revenue", (row) => row.units * row.price)
  .derive("month", (row) => truncMonth(row.date))
  .groupBy("month", "region")
  .agg({
    revenue: (g) => g.sum("revenue"),
    units: (g) => g.sum("units"),
    orders: (g) => g.count(),
  })
  .sort("month")
  .filter((r) => r.units > 0);
