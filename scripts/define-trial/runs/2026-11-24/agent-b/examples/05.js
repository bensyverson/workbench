import { program } from "../data.grammar.js";

// year is a numeric select: enumOf takes strings only, so it is an f64 with
// options (selectNumber), and the "is it one of these" check is the builder's shape check.
export default program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { id: "number", customer_id: "number", placed_at: "date", amount: "number" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "number", name: "string", segment: "string" } })
  .param("topN", { slider: { min: 5, max: 50, value: 10 } })
  .param("year", { selectNumber: { options: [2024, 2025, 2026], value: 2026 } })
  .table("top", "orders")
    .filter((o) => year(o.placed_at) === $.year)
    .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
    .groupBy("name", "segment")
    .agg("total", "number", (g) => g.sum("amount"))
    .agg("orders", "number", (g) => g.count())
    .sort("-total")
    .limit(() => $.topN)
  .chart("bars", "top", "bar")
    .x("total")
    .y("name", { sort: "-x" })
    .color("segment");

// REFUSED: B001 (rejected "view"): .view(c => wb.layout.row(…)) has no layout (rules R8).
//
// Joins, as the author would get them wrong:
//   .join("customer", { on: { customer_id: "id" } })
// B003  no table "customer"; did you mean "customers"?
//   .join("customers", { on: { customer_id: "name" } })
// W005  join key types differ: top.customer_id is number, customers.name is string
//   (it points at the whole { on } argument: ctx.error's arg is a position, not a path into an object)
//
// Pasting SQL text:
//   .table("top", "SELECT c.name, SUM(o.amount) AS total FROM orders o JOIN … LIMIT 10")
// B003  no table "SELECT c.name, …"   (thrown at the call, by ref("table"), before any check of mine)
// W002  table "top" got a string that reads as SQL. The language does not take SQL text   (at .build(), if B003 lets it through)
//   The rewrite fixit of the Dream Code needs a SQL parser in the check; ctx.error's fix is one text.
// The old spelling .sql`…` gets the rejected entry: "SQL text is not an input language".
