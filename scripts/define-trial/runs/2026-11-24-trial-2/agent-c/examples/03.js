// Partly fits. Changes from the example:
//  - wb.select with a data-driven option list (from: t => ...) is a build-time lambda: refused; region is a plain value.
//  - wb.date({ value: "2026-01-01" }) becomes milliseconds, since there is no date literal.
//  - .view(...) renders and is refused (R8).
import { program } from "../data.grammar.js";

export default program("filters")
  .source("sales", { date: "date", region: "str", units: "f64", price: "f64" })
  .param("minUnits", { value: 50, min: 0, max: 500, step: 10 })
  .param("region", { value: "All" })
  .param("since", { date: 1767225600000 })
  .table("picked", "sales")
    .filter(row => row.units >= $.minUnits)
    .filter(row => $.region === "All" || row.region === $.region)
    .filter(row => row.date >= $.since);
