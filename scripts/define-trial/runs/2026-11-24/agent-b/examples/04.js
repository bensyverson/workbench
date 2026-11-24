import { program } from "../data.grammar.js";

export default program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "string", units: "number", price: "number" } })
  .param("metric", { select: { options: ["revenue", "units"], value: "revenue" } })
  .table("monthly", "sales")
    .derive("revenue", "number", (row) => row.units * row.price)
    .derive("month", "date", (row) => truncMonth(row.date))
    .groupBy("month", "region")
    .agg("revenue", "number", (g) => g.sum("revenue"))
    .agg("units", "number", (g) => g.sum("units"))
    .agg("orders", "number", (g) => g.count())
    .sort("month")
  .chart("trend", "monthly", "line")
    .x("month", { type: "time" })
    .y({ param: "metric" })
    .color("region")
    .tooltip("month", "region", "revenue", "orders")
    .title("Monthly revenue or units by region");

// REFUSED: B004 (a lambda where data() expects a value): three pieces have no form here.
//   .y(…, { format: $.metric === "revenue" ? "$,.0f" : ",d" }): a format that follows a param needs a
//     runtime lambda in a declaration argument; data() takes values only.
//   .title(() => `Monthly ${$.metric} by region`): string building is outside the Runtime Subset, and
//     a chart title is not a lambda slot. The static title above stands in for it.
//   .view(c => wb.layout.column(…)): B001 (rejected "view"), no layout (rules R8).
//
// The encoding typo:  .chart("trend", "monthly", "bar").x("monht")
// W001  encoding x names "monht", not a column of "monthly"; did you mean "month"?
