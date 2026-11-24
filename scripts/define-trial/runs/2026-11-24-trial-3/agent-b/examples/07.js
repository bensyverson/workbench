// REFUSED: B001. Fragments (wb.fragment("table", { winsorize, zscore }), column attrs, chart methods) are
// "not built": there is no way to add a method to a construct from a Program, so `.winsorize(...)`
// is a B001 (no such method). Also missing: quantiles / stats in the Dialect, `this`, closures over
// q, and per-column attributes (unit, currency).
