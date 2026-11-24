import { program } from "../data.grammar.js";

// REFUSED (part): wb.fn.year(o.placed_at) (no date type); .limit($.topN) (limit takes a literal number only);
// the join type check E-JOIN-TYPE (needs schemas; the draft has none). SQL text is refused by name:
// REFUSED: sql  rejected entry on the table construct: "SQL text is not an input language", tip: build the query with table methods.
export default program("top-customers")
  .source("orders", { csv: "data/orders.csv" })
  .source("customers", { csv: "data/customers.csv" })
  .param("topN", { value: 10, min: 5, max: 50 })
  .param("year", { value: 2026 })
  .table("top", "orders")
    .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
    .groupBy("name", "segment")
    .agg("total", g => g.sum("amount"))
    .agg("orders", g => g.count())
    .sort("-total")
    .limit(10)
  .chart("bars", "top")
    .kind("bar")
    .x("total", {})
    .y("name", { sort: "-x" })
    .color("segment", {})
  .view("top", "bars");
// .join("customer", ...) would be B003 (no table "customer"; did you mean "customers").
