import { program } from "../data.grammar.js";

// Dates are f64 days since 1970-01-01; the date param's string value is parsed
// to that number by the language (an assumption: the draft has no date type).
export default program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "string", units: "number", price: "number" } })
  .param("minUnits", { slider: { min: 0, max: 500, step: 10, value: 50, label: "Minimum units" } })
  .param("region", { selectFrom: { table: "sales", column: "region", value: "All" } })
  .param("since", { date: { value: "2026-01-01" } })
  .table("picked", "sales")
    .filter((row) => row.units >= $.minUnits)
    .filter((row) => $.region === "All" || row.region === $.region)
    .filter((row) => row.date >= $.since);

// REFUSED: B001 (rejected "view"): .view((t, $) => wb.layout.column(wb.controls(…), t.picked.grid({ pageSize: 25 })))
//   has no layout, controls or grid in this language (rules R8).
//
// Wrong param use, as the author would write it:
//   .table("x", "sales").filter((row) => row.units > $.minUnit)
// L002  the params ($) has no member "minUnit"; did you mean "minUnits"?
//   .table("y", "sales").filter((row) => row.region > $.minUnits)
// L…    compares str (row.region) with f64 ($.minUnits)   (the draft names no code for it)
