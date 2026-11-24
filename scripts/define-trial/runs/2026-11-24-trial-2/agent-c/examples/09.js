// Partly fits. The Program is the base table of example 04. The Environment session (wb.env, set,
// addStep, addTable, undo, commit) is an effect and a store rule (R8): refused, and not written here.
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
