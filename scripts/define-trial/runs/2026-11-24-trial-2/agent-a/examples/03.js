import { program } from "../data.grammar.js";

export default program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 50, label: "Minimum units" })
  .param("region", { options: ["All", "North", "South"], value: "All" })
  .param("since", { value: "2026-01-01", kind: "date" })
  .table("picked", "sales")
  .filter(row => row.units >= $.minUnits)
  .filter(row => $.region === "All" || row.region === $.region)
  .filter(row => row.date >= $.since);
// REFUSED (part): select `from: t => t.sales.distinct(...)` (build-time lambda), wb.controls / layout / grid views.
