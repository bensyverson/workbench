// REFUSED: B007. No diagnostic exists for it: the whole example is build-time lambdas (wb.build(...)
// returning grammar, one chart per numeric column, describe(), a pivot from sampled distinct values),
// which R8 and "Not built" exclude. The language gives no code for a build-time lambda; the nearest is
// B007 (a lambda that is not a runtime arrow). Needed: build-time slots, a schema-reflecting
// `columns` iteration, a sample() oracle, and pivot with data-dependent columns.
