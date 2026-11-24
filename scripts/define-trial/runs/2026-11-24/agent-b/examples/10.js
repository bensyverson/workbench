import { program } from "../data.grammar.js";

// REFUSED: B001 (rejected "component"): wb.component("cohort", …) declares a new construct from a Program,
// with a build-time argument and an expand() that returns grammar; rules R8 rule out both.
// The cohort is written out by hand below, with bucket fixed at "month" (the build-time choice
// from the events' date range cannot be made: environment() never sees the data).
// REFUSED: B001 (rejected "rule" on chart), B001 (rejected "view"), B001 (rejected "agent"): the reference
// rule, the layout with its book note, and the agent permissions have no form here.
export default program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "string", ts: "date", kind: "string" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "string", name: "string" } })
  .param("plan", { selectFrom: { table: "plans", column: "name", value: "pro" } })
  .param("minEvents", { slider: { min: 1, max: 20, value: 3 } })
  .table("onPlan", "plans")
    .filter((p) => p.name === $.plan)
  .table("eligible", "events")
    .semiJoin("onPlan", { on: "user_id" })
    .keepGroups("user_id", (g) => g.count() >= $.minEvents)
    .select("user_id", "ts", "kind")
  // cohort expansion, by hand
  .table("firstSeen", "eligible")
    .groupBy("user_id")
    .agg("cohort", "date", (g) => g.min("ts"))
    .derive("cohort", "date", (r) => truncMonth(r.cohort))
  .table("cohorts", "eligible")
    .filter((row) => row.kind !== "heartbeat")
    .join("firstSeen", { on: "user_id", take: ["cohort"] })
    .derive("period", "number", (r) => monthsBetween(r.cohort, r.ts))
    .groupBy("cohort", "period")
    .agg("users", "number", (g) => g.countDistinct("user_id"))
  .table("base", "cohorts")
    .filter((r) => r.period === 0)
    .rename({ users: "base" })
    .select("cohort", "base")
  .table("ret", "cohorts")
    .join("base", { on: "cohort", take: ["base"] })
    .derive("retention", "number", (r) => r.users / r.base)
  .chart("heat", "ret", "heatmap")
    .x("period")
    .y("cohort", { type: "ordinal" })
    .color("retention", { scheme: "sequential", format: ".0%" })
  .chart("curves", "ret", "line")
    .x("period")
    .y("retention")
    .color("cohort");
