import { program } from "../data.grammar.js";

// Partly fits: the eligible table. Refused: wb.component("cohort", ...) and .cohort(...) (a construct defined by the user
// is not in the API; its build-time bucket arg is refused, R8, and its expansion uses joins on a table built inside it);
// .chart(...), .view(...) and .agent(...) (rendering and agent permissions); and the plan param's options
// (wb.select({ from: t => t.plans.distinct("name") }), a build-time lambda; the default is kept).
// Also: the filter on plans is written as its own named table, since a table cannot be an argument in the API.
export default ($) => program("retention")
  .param("plan", { value: "pro" })
  .param("minEvents", { min: 1, max: 20, value: 3 })
  .source("events", { user_id: "str", ts: "date", kind: "str" })
  .source("plans", { user_id: "str", name: "str" })
  .table("proPlans", "plans")
  .filter((p) => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("proPlans", { on: "user_id" })
  .keepGroups("user_id", (g) => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind");
