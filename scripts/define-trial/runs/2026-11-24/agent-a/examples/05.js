import { program } from "../data.grammar.js";

// The year param's options are numbers; there is no int, so $.year and year(…) are f64.
// Each aggregate is its own .agg call, with its type. .limit reads the param as { param: "topN" }.
export default program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { customer_id: "f64", placed_at: "str", amount: "f64" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "f64", name: "str", segment: "str" } })
  .param("topN", { min: 5, max: 50, value: 10 })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)
  .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
  .groupBy("name", "segment")
  .agg("total", "f64", (g) => g.sum("amount"))
  .agg("orders", "f64", (g) => g.count())
  .sort("-total")
  .limit({ param: "topN" })
  .chart("bars", "top", "bar")
  .x("total")
  .y({ field: "name", sort: "-x" })
  .color("segment");

// REFUSED: B001 (rejected "view"): the row layout of controls, chart and grid (R8).
//
// .join("customer", …)
// B003  no table "customer"; did you mean "customers"?
// .join("customers", { on: { customer_id: "name" } })
//   a join-key type check (f64 vs str) needs a slot check reading both schemas: possible, not written.
//
// Pasted SQL:
// .table("top", "SELECT c.name, SUM(o.amount) AS total FROM orders o JOIN customers c …")
// B003  no table "SELECT c.name, …"  (from ref("table"), first), then
// W010  table "top" got a string that reads as SQL; the language does not take SQL text
//   tip: build the query with table methods: .join, .groupBy, .agg, .sort, .limit
//   (the rewrite fixit of the Dream Code cannot be produced: a check has no SQL parser)
// program("p").sql`…`
// B001 (rejected "sql")  SQL text is not an input language
