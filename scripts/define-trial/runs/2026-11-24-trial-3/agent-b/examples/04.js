import { program } from "../data.grammar.js";

// REFUSED: partly. .y(() => $.metric) and .title(() => `...`) make a column name and text from a runtime
// param: a ref and a string are build-time values here, and there are no template literals. y is "revenue".
// The wb.layout / wb.controls view is rendering (R8) and is omitted.
export default ($) => program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("metric", { options: ["revenue", "units"], value: "revenue" })
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
  .chart("trend", "monthly")
  .mark("line")
  .x("month", { type: "time" })
  .y("revenue", { format: "$,.0f" })
  .color("region")
  .tooltip("month", "region", "revenue", "orders")
  .title("Monthly revenue by region");
