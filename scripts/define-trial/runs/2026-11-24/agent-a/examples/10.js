// REFUSED: B001 (rejected "cohort", "component", "agent", "view"): the custom component, its build-time
// bucket, the agent hook and the view are not part of this language (R8). The cohort's own steps need
// date arithmetic (trunc, diff of dates), a self-join on a derived table, and a cross-row lookup
// (first("users", { cohort, period: 0 })) that a row lambda cannot express. What fits: the eligible table.
import { program } from "../data.grammar.js";

export default program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "str", ts: "str", kind: "str" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "str", name: "str" } })
  .param("plan", { distinctOf: { table: "plans", column: "name" }, value: "pro" })
  .param("minEvents", { min: 1, max: 20, value: 3 })
  .table("onPlan", "plans")
  .filter((p) => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("onPlan", { on: "user_id" })
  .keepGroups("user_id", (g) => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind");
