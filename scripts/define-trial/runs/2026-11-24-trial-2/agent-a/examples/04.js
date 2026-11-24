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
  .chart("trend", "monthly")
  .mark("line")
  .x("month", { type: "time" })
  .y(() => $.metric, { format: () => ($.metric === "revenue" ? "$,.0f" : ",d") })
  .color("region")
  .tooltip("month", "region", "revenue", "orders");
// REFUSED (part): .title(() => `Monthly ${$.metric} ...`) (template literal), .view(...) layout;
// chart columns (x, color, tooltip) are plain strings: nothing checks them against the table.
