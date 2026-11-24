import { program } from "../data.grammar.js";

// REFUSED: partly. The `cohort` component (wb.component, wb.arg.build / wb.arg.run, expand) is a
// build-time lambda that returns grammar and a new construct from inside a Program: R8 / "not built".
// The ret table, its heat and curves charts, the layout / book note and the agent hook (.agent, .can,
// .cannot: effects and permissions) are therefore omitted. What fits is the eligible table, with
// semiJoin and keepGroups declared as table methods in the grammar. The plan param is a plain string
// (its `from` is a build-time lambda).
export default ($) => program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "str", ts: "date", kind: "str" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "str", name: "str" } })
  .param("plan", { value: "pro" })
  .param("minEvents", { min: 1, max: 20, value: 3 })
  .table("planned", "plans")
  .filter((p) => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("planned", { on: { user_id: "user_id" } })
  .keepGroups("user_id", (g) => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind");
