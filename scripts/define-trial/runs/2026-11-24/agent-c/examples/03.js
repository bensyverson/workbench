import { program } from "../data.grammar.js";

// REFUSED (part): wb.select({ from: t => t.sales.distinct("region") }) is a build-time lambda (R8); region is a plain
// string param. wb.date has no date type (a string). Layout and controls are refused (no layout, no rendering).
export default program("filters")
  .source("sales", { csv: "data/sales.csv" })
  .param("minUnits", { value: 50, min: 0, max: 500, step: 10, label: "Minimum units" })
  .param("region", { value: "All" })
  .param("since", { value: "2026-01-01" })
  .table("picked", "sales")
    .filter(row => row.units >= $.minUnits)
    .filter(row => $.region === "All" || row.region === $.region)
    .filter(row => row.date >= $.since)
  .view("picked");
// p.table("x","sales").filter(row => row.units > $.minUnit)  would be an L-code: Params has no member "minUnit".
