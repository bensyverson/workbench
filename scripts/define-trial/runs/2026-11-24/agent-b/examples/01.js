import { program } from "../data.grammar.js";

// Types are declared, not inferred: environment() sees the record, not the file.
// The 20-row look is a table; showing it is the host's job.
export default program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "string", units: "number", price: "number" } })
  .table("firstRows", "sales")
    .limit(() => 20);

// REFUSED: B001 (rejected "view"): .view(t => t.sales.head(20)) gets
//   "views and layout are not part of this language yet: a Program declares data and charts, it does not render them".
//   The draft has no layout or rendering (rules R8), so there is no view construct.
// Also not expressible: built.schema("sales") and await built.run(); the draft stops at the record.
