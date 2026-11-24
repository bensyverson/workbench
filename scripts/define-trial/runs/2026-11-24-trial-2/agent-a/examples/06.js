// REFUSED: B009 program.charts(...): build-time lambdas that return grammar are not part of this language.
// Fan-out over a schema, table.describe(), and a pivot whose columns come from sampled data all need build-time
// slots (a function that runs while the Program is built and returns grammar), which the API lists as not built.
