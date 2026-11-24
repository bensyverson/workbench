// Partly fits. The Program is example 04's table. The IR inspection (listing, lineage, downstreamOf,
// diff, toJSON) is tooling over the built record, not part of a Program: refused (R8), and it is not
// written here. The record is what .build() returns, which the checker produces.
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
