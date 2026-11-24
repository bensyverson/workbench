// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 4: group, aggregate and chart. `wb.fn.truncMonth` is the bare intrinsic; the chart's
// format is a lambda (a value computed from `$` outside a lambda means nothing); `.title` with a template
// literal and `.view` are left out.
import { program } from "../grammar.js";

export default () => program("revenue-by-month")
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
  .y(() => $.metric, { format: () => ($.metric === "revenue" ? "$,.0f" : ",d") })
  .color("region")
  .tooltip("month", "region", "revenue", "orders");
