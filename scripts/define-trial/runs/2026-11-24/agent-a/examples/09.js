// REFUSED: B001: the Environment, sessions, mutations, the event log, undo and commit are not part of
// the Definition API (no effects, R8), and a builder has no method for them. What fits: the Program an
// agent's session would hand back with s.toProgram() after mutations 1–3 (4 was undone), written out.
import { program } from "../data.grammar.js";

export default program("filters")
  .source("sales_raw", { csv: "data/sales.csv", columns: { date: "str", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 100, label: "Minimum units" })
  .table("sales", "sales_raw")
  .filter((row) => row.price > 0)
  .table("refunds", "sales_raw")
  .filter((row) => row.price < 0)
  .groupBy("region")
  .agg("n", "f64", (g) => g.count());

// s.addStep("sales", wb.step.derive("x", row => row.prise * 2)) would be, as builder code,
//   .table("sales", …).derive("x", "f64", (row) => row.prise * 2)
// L002  a row of table "sales" at step 2 has no member "prise"; did you mean "price"?
