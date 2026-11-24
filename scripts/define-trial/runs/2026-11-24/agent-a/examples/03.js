import { program } from "../data.grammar.js";

// REFUSED: B001 (rejected "view"): the controls and grid layout are not part of this language (R8).
// The select's options come from the data: written as { distinctOf: { table, column } } data,
// not as the lambda `t => t.sales.distinct("region")`, which would build grammar.
// "since" is a date param: there is no date type, so it is a str and compares as an ISO string.
export default program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "str", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 50, label: "Minimum units" })
  .param("region", { distinctOf: { table: "sales", column: "region" }, value: "All" })
  .param("since", { value: "2026-01-01", date: true })
  .table("picked", "sales")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => $.region === "All" || row.region === $.region)
  .filter((row) => row.date >= $.since);

// .table("x", "sales").filter((row) => row.units > $.minUnit)
// L002  the params ($) has no member "minUnit"; did you mean "minUnits"?
// .table("y", "sales").filter((row) => row.region > $.minUnits)
// L…    compares str (row.region) with f64 ($.minUnits)
