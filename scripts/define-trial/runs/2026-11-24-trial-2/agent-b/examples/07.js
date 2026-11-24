// REFUSED: B009 ".fragment" is rejected: "fragments are not part of this language" (and column attributes
// unit/currency have no home). The fragment bodies winsorize and zscore are written out by hand below;
// quantiles and stats come from the derive lambda's second parameter.
import { program } from "../data.grammar.js";

export default program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("clean", "sales")
  .derive("price", (row, s) => max(min(row.price, s.quantile("price", 0.99)), s.quantile("price", 0.01)))
  .derive("price_z", (row, s) => (row.price - s.mean("price")) / s.sd("price"))
  .chart("dist", "clean", "histogram")
  .x("price_z")
  .rule(3, { label: "3σ" });
