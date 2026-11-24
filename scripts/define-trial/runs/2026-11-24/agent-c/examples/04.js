import { program } from "../data.grammar.js";

// REFUSED (part): wb.fn.truncMonth (no date type, no date intrinsics); y(() => $.metric) and a title template are
// runtime lambdas that return grammar/strings, not row values, with no slot convention; layout.
export default program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv" })
  .param("metric", { value: "revenue", options: ["revenue", "units"] })
  .table("monthly", "sales")
    .derive("revenue", row => row.units * row.price)
    .groupBy("date", "region")
    .agg("revenue", g => g.sum("revenue"))
    .agg("units", g => g.sum("units"))
    .agg("orders", g => g.count())
    .sort("date")
  .chart("trend", "monthly")
    .kind("line")
    .x("date", { type: "time" })
    .y("revenue", { format: "$,.0f" })
    .color("region", {})
    .tooltip("date", "region", "revenue", "orders")
    .title("Monthly revenue by region")
  .view("trend");
