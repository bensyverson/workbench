// REFUSED: B001 (rejected "view"): views and layout are not part of this language yet.
// The view part (`.view(t => t.sales.head(20))`, a rendered grid) is refused by R8: no rendering.
// Column types cannot be inferred from the CSV when the Program is built: environment(program) is plain,
// synchronous JavaScript over the record and cannot read the file, so the columns are declared.
// "date" has no type (it is a str holding an ISO date) and "units" is an f64 (no int).
// What fits: the source, and the first 20 rows as a table.
import { program } from "../data.grammar.js";

export default program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "str", region: "str", units: "f64", price: "f64" } })
  .table("firstRows", "sales")
  .limit(20);
