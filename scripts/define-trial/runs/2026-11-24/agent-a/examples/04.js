import { program } from "../data.grammar.js";

// REFUSED: B001 (rejected "view"): the view with its controls is not part of this language (R8).
// .agg takes one aggregate per call (a slot takes one lambda), with its type declared.
// .y follows the select as { param: "metric" }; its format and the title are run-space lambdas.
// The title's template literal is written with the concat intrinsic (no string building otherwise).
export default program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "str", region: "str", units: "f64", price: "f64" } })
  .param("metric", { options: ["revenue", "units"], value: "revenue" })
  .table("monthly", "sales")
  .derive("revenue", "f64", (row) => row.units * row.price)
  .derive("month", "str", (row) => truncMonth(row.date))
  .groupBy("month", "region")
  .agg("revenue", "f64", (g) => g.sum("revenue"))
  .agg("units", "f64", (g) => g.sum("units"))
  .agg("orders", "f64", (g) => g.count())
  .sort("month")
  .chart("trend", "monthly", "line")
  .x({ field: "month", type: "time" })
  .y({ param: "metric" })
  .format("y", () => ($.metric === "revenue" ? "$,.0f" : ",d"))
  .color("region")
  .tooltip("month", "region", "revenue", "orders")
  .title(() => concat(concat("Monthly ", $.metric), " by region"));

// .chart("bad", "monthly", "bar").x("monht")
// W… would need a chart-level check against the table's columns; the draft's check(call, ctx)
// gives ctx.program, so it can be written: "chart "bad": encoding x names "monht"; did you mean "month"?"
