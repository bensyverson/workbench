// REFUSED: B001 winsorize: the language has no fragments (R8), and no table method for it.
// zscore needs whole-column stats inside a row lambda, which no slot or intrinsic gives; column
// attributes (.column(..., c => c.currency(...))) are not built either.
