# Hidden pilot programs (budget planner)

## accept/ (must build and check clean)
- a01.js: minimal Program, start plus one account, no horizon, no flows
- a02.js: the sketch's core: params, inflow/outflow, transfer to a later-declared account, balance
- a03.js: lambdas with zero, one, two and three parameters; f and balance
- a04.js: m.year, m.month, m.index, month comparisons <, <=, === with monthOf
- a05.js: Math.round, min, max, abs; a param read in a lambda
- a06.js: top-level arrow helpers, one calling another and one taking m
- a07.js: top-level plain-data constants (object and numbers) read by lambdas
- a08.js: horizon omitted; a param read in a lambda
- a09.js: build-time ternaries over params in horizon and opening (RISKY: sketch does not say a ternary over a param is fine for opening)
- a10.js: build-time for loop over a param adding accounts, block-body function (RISKY: sketch says builder chain; block body and builder reassignment not stated)
- a11.js: three accounts, two transfers from one account, transfers back and forward to later accounts, transfer lambda using f and balance
- a12.js: start 2025-12 (year rollover), horizon 120, mixed lambda arities, helper plus param

## reject/ (each has exactly one mistake; number = item in "What it must refuse")
- r01a.js: f.food read before food is declared
- r01b.js: misspelled flow name in f
- r01c.js: f reads a flow of another account
- r02a.js: transfer to a nonexistent account
- r02b.js: transfer to its own account
- r03a.js: duplicate flow name in one account
- r03b.js: duplicate account name
- r04a.js: m.date compared with a number
- r04b.js: arithmetic on m.date
- r05a.js: lambda returns a boolean
- r05b.js: lambda returns a string
- r06.js: negative opening
- r07.js: horizon given a lambda
- r08.js: .loan
- r09.js: undeclared param $.rnet
- r10a.js: Math.sin
- r10b.js: Math.floor
- r10c.js: Date.now
- r11.js: lambda calls a top-level function made by another function
- r12a.js: start missing
- r12b.js: start twice
