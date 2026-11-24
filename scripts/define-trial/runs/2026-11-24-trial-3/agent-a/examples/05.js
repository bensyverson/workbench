import { program } from "../data.grammar.js";

// REFUSED: B009 for the pasted SQL: program.sql(`SELECT …`) gives "SQL text is not an input language",
// tip "build the query with table methods: .join, .groupBy, .agg, .sort, .limit". A string passed where a
// table opens is a ref, so .table("top", "SELECT …") is B003 (no table of that name). The view is
// layout, refused by .view (B009). The Program below is the builder form of the query.
export default ($) => program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { customer_id: "f64", placed_at: "date", amount: "f64" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "f64", name: "str", segment: "str" } })
  .param("topN", { widget: "slider", min: 5, max: 50, value: 10 })
  .param("year", { widget: "select", options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)
  .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
  .groupBy("name", "segment")
  .agg({
    total: (g) => g.sum("amount"),
    orders: (g) => g.count(),
  })
  .sort("-total")
  .limit($.topN)
  .chart("bars", "bar", "top")
  .x("total")
  .y("name", { sort: "-x" })
  .color("segment");

// .join("customer", …)                          B003: no table 'customer'; did you mean 'customers'?
// .join("customers", { on: { customer_id: "name" } })   T001: join key types differ: customer_id is f64, customers.name is str
