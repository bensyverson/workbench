import { program } from "../data.grammar.js";

// The view (controls above a 25-row grid) is layout and rendering, refused by .view (B009).
export default ($) => program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { widget: "slider", min: 0, max: 500, step: 10, value: 50, label: "Minimum units" })
  .param("region", { widget: "select", from: { table: "sales", column: "region" }, value: "All" })
  .param("since", { widget: "date", value: Date.UTC(2026, 0, 1) })
  .table("picked", "sales")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => $.region === "All" || row.region === $.region)
  .filter((row) => row.date >= $.since);

// Wrong param use is refused when lowered:
//   .filter((row) => row.units > $.minUnit)      L002: the params ($) has no member 'minUnit' (did you mean 'minUnits')
//   .filter((row) => row.region > $.minUnits)    compares str with f64
