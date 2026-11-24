import { program } from "../data.grammar.js";

// Not expressible: the title template literal (title is static text), controls and layout.
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
  .chart("trend", "monthly", "line")
  .x("month", { type: "time" })
  .yBy(() => $.metric)
  .formatBy(() => $.metric === "revenue" ? "$,.0f" : ",d")
  .color("region")
  .tooltip("month", "region", "revenue", "orders")
  .title("Monthly metric by region")
  .view("monthly", "trend");
