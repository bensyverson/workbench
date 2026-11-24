import { program } from "../data.grammar.js";

// REFUSED: (no code) the Environment session (wb.env, session, set, addStep, addTable, addChart, log, undo,
// toProgram, commit) is a mutation API with an event log; the draft has no effects and no mutation API
// (rules R8), and its "environment(program)" is a different thing: what one Program adds to the Dialect.
// What can be written is the Program the session would propose with s.toProgram() after steps 1-3
// (step 4, the chart, was undone).
export default program("proposal")
  .source("sales_raw", { csv: "data/sales.csv", columns: { date: "date", region: "string", units: "number", price: "number" } })
  .param("minUnits", { slider: { min: 0, max: 500, step: 10, value: 100, label: "Minimum units" } })
  .table("sales", "sales_raw")
    .filter((row) => row.price > 0)            // why: negative prices are refunds (no place for "why" in the record)
  .table("refunds", "sales_raw")
    .filter((row) => row.price < 0)
    .groupBy("region")
    .agg("n", "number", (g) => g.count());

// The refused mutation, as builder code:  .table("x", "sales").derive("x", "number", (row) => row.prise * 2)
// L002  a row of sales (row) has no member "prise"; did you mean "price"?
// addStep on an existing table cannot be written at all: steps go on the table's own chain, and a
// second .table("sales", …) is B002.
