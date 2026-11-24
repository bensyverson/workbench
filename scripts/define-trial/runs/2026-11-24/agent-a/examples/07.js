// REFUSED: B001 (rejected "fragment"): fragments are not part of this language (R8).
// What fits: the same Program with winsorize, zscore, column attributes and the chart rule made
// built-in steps of the language instead of fragments. zscore's row lambda would need whole-column
// statistics (stats.mean, stats.sd) inside a row lambda; a built-in step hides that, but the
// language cannot express it in its own terms.
import { program } from "../data.grammar.js";

export default program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { date: "str", region: "str", price: "f64", weight: "f64" } })
  .table("clean", "sales")
  .column("price", { currency: "USD" })
  .column("weight", { unit: "kg" })
  .winsorize("price", { lo: 0.01, hi: 0.99 })
  .zscore("price")
  .chart("dist", "clean", "histogram")
  .x("price_z")
  .rule(3, { label: "3σ" });

// .winsorise("price")
// B001  table has no method "winsorise"; did you mean "winsorize"?
// .column("price", { currency: "YEN" })
// B004  currency must be one of USD, EUR, GBP
