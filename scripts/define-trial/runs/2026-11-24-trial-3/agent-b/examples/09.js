import { program } from "../data.grammar.js";

// REFUSED: partly. The Environment, sessions, s.set / addStep / undo / log / commit are mutation with an
// event log: effects, "not built" (R8). What fits is the Program the session ends up proposing
// (s.toProgram()): the sales filter, the refunds table and its chart. The refusal diagnostic for
// row.prise is the language's own L-code at lowering, not an E-COL-UNKNOWN.
export default ($) => program("refunds")
  .source("sales_raw", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("sales", "sales_raw")
  .filter((row) => row.price > 0)
  .table("refunds", "sales_raw")
  .filter((row) => row.price < 0)
  .groupBy("region")
  .agg({ n: (g) => g.count() })
  .chart("refundBars", "refunds")
  .mark("bar")
  .x("region")
  .y("n");
