import { program } from "../data.grammar.js";

// Partly fits. Refused: wb.select({ from: t => t.sales.distinct("region") }) (its options come from a build-time
// lambda, which is not in the API; the options here are written out), wb.slider's label, wb.date (the date param is a
// number with date: true), and .view(...) (no rendering). The since value is 2026-01-01T00:00:00Z in ms.
export default ($) => program("filters")
  .param("minUnits", { min: 0, max: 500, value: 50 })
  .param("region", { options: ["All", "North", "South"], value: "All" })
  .param("since", { value: 1767225600000, date: true })
  .source("sales", { date: "date", region: "str", units: "f64", price: "f64" })
  .table("picked", "sales")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => $.region === "All" || row.region === $.region)
  .filter((row) => row.date >= $.since);
