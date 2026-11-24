// Partly fits. The table is the whole of it. The chart and the view render and are refused (R8);
// the chart's runtime lambda, .y(() => $.metric), has no target here.
import { program } from "../data.grammar.js";

export default program("revenue-by-month")
  .source("sales", { date: "date", region: "str", units: "f64", price: "f64" })
  .param("metric", { value: "revenue", options: ["revenue", "units"] })
  .table("monthly", "sales")
    .derive("revenue", row => row.units * row.price)
    .derive("month", row => truncMonth(row.date))
    .groupBy("month", "region")
    .agg({
      revenue: g => g.sum("revenue"),
      units: g => g.sum("units"),
      orders: g => g.count(),
    })
    .sort("month");
