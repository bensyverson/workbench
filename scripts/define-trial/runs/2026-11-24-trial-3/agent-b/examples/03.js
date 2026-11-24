import { program } from "../data.grammar.js";

// REFUSED: partly. wb.select({ from: t => t.sales.distinct("region") }) is a build-time lambda (R8): the
// region param is a plain string here. wb.layout / wb.controls / .view are rendering (R8) and are omitted.
export default ($) => program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 50, label: "Minimum units" })
  .param("region", { value: "All" })
  .param("since", { value: "2026-01-01", type: "date" })
  .table("picked", "sales")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => $.region === "All" || row.region === $.region)
  .filter((row) => row.date >= $.since);
