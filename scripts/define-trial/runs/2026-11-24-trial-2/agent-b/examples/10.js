// REFUSED: B009 ".cohort" and ".agent" are rejected (a custom component needs build-time lambdas and
// wb.component; agent permissions are the Environment). The book note and layout are not expressible.
// Below is the rest: the eligible table (semiJoin, keepGroups), a per-user count, and the charts that fit.
import { program } from "../data.grammar.js";

export default program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "str", ts: "date", kind: "str" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "str", name: "str" } })
  .param("plan", { options: ["pro", "team", "free"], value: "pro" })
  .param("minEvents", { min: 1, max: 20, value: 3 })
  .table("onPlan", "plans")
  .filter(p => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("onPlan", { on: "user_id" })
  .keepGroups("user_id", g => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind")
  .table("active", "eligible")
  .filter(row => row.kind !== "heartbeat")
  .groupBy("user_id")
  .agg({ events: g => g.count(), first: g => g.min("ts") })
  .chart("curves", "active", "histogram")
  .x("events", { bins: 20 })
  .rule(0.2, { label: "target" })
  .view("active", "curves");
