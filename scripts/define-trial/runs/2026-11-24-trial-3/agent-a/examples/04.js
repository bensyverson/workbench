import { program } from "../data.grammar.js";

// The view (controls beside the chart) is layout, refused by .view (B009). The y format is read at
// build time ($.metric folded), so it does not follow the select without a rebuild.
export default ($) => program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("metric", { widget: "select", options: ["revenue", "units"], value: "revenue" })
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
  .chart("trend", "line", "monthly")
  .x("month", { type: "time" })
  .y(() => $.metric, { format: $.metric === "revenue" ? "$,.0f" : ",d" })
  .color("region")
  .tooltip("month", "region", "revenue", "orders")
  .title(() => ($.metric === "revenue" ? "Monthly revenue by region" : "Monthly units by region"));

// .chart("trend", "bar", "monthly").x("monht")   B003: no column 'monht'; did you mean 'month'?
