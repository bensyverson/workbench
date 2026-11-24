// Partly fits. Changes from the example:
//  - the CSV source declares its columns as text; there is no file reader, so types come from cast.
//  - units: "int" is refused by the cast shape (B004); there is no integer type, so it is cast to f64.
//  - dropNulls is not written: the type system has no nullable column to narrow.
import { program } from "../data.grammar.js";

export default program("clean-sales")
  .source("raw", { date: "str", region: "str", units: "str", "Unit Price": "str" })
  .table("sales", "raw")
    .rename("Unit Price", "price")
    .cast("date", "date")
    .cast("units", "f64")
    .cast("price", "f64")
    .trim("region")
    .replace("region", { "N.": "North", "S.": "South" })
    .dedupe("date", "region")
    .derive("revenue", row => row.units * row.price);
