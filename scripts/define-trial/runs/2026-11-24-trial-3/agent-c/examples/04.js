import { program } from "../data.grammar.js";

// Partly fits: the table. Refused: .chart(...) and .view(...) (rendering, not in the API), and the metric
// is declared but read only by the chart, so it is unused here.
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
