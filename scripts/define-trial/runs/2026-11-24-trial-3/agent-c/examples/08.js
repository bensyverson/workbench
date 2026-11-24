import { program } from "../data.grammar.js";

// Partly fits: the Program is example 4's. Refused: built.ir.nodes, built.listing(), built.lineage(), built.downstreamOf()
// and built.diff() (host tools that read the IR; the builder returns only the record, and the record has no lineage or diff).
// REFUSED: B001 for those calls. The IR's phase per node (build or run) has no counterpart in the API.
export default ($) => program("revenue-by-month")
  .param("metric", { options: ["revenue", "units"], value: "revenue" })
  .source("sales", { date: "date", region: "str", units: "f64", price: "f64" })
  .table("monthly", "sales")
  .derive("revenue", (row) => row.units * row.price)
  .derive("month", (row) => truncMonth(row.date))
  .groupBy("month", "region")
  .agg({
    revenue: (g) => g.sum("revenue"),
    units: (g) => g.sum("units"),
    orders: (g) => g.count(),
  })
  .sort("month");
