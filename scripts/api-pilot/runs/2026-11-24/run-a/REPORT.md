# Budget planner: report

## Difficulty

2. The first draft, built from API.md's examples, checked clean on the first run; the work was in the three refusals the API has no declarative way to say (flow names unique per account, a transfer to its own account, a negative opening), and in finding out where a slot check can see "this account".

## Refusals

1. A flow read not declared earlier: **L002** ("the flows declared so far in account 'a' (f) has no member 'food'"), with "Did you mean 'salary'?" for a misspelling. A flow from another account and a transfer's target name are L002 too, since `f` is built per account by `state.step`.
2. Transfer to a missing account: **B003** with did-you-mean (`ref("account")`, which also resolves accounts declared later). To its own account: **U010** (my slot check).
3. Two flows of one name in one account: **U009** (my slot check). Two accounts of one name: **B002** (reported twice by the kit, see Gaps).
4. `m.date > 5` and `m.date + 1`: **L003** (the nominal `month` scalar).
5. `(m) => m.index > 3`: **L003** ("This is bool, but a flow's result needs f64"). `(m) => m.date` is L003 too.
6. Negative `opening`: **U007** (account construct check).
7. `.horizon(() => $.months)`: **B004**.
8. `.loan(…)`: **B009** ("account does not offer .loan(): this budget language has no loans", fix `.outflow("loan", (m) => 300)`), on an account and on the budget.
9. `$.rnet`: **L002** with "Did you mean 'rent'?".
10. `Math.sin`: **L002** ("Math has no member 'sin'"); in a top-level helper, L002 on the helper plus L014 at the lambda that calls it.
11. `const bump = makeBump(2)`: **B012**.
12. `start` missing: **B005**; twice: **B006**.

Extra checks of mine: U001 param min above max, U002 param value outside min..max, U003/U004 start year not whole / month not 1–12, U005 horizon not a whole 1–120, U006 a budget with no account (the sheet says "one or more"), U008 a flow name that is not an identifier. A build-time read of a param before its `.param` is the kit's B003.

## Where the documents misled you

- API.md: "`name(ns)` declares a name in namespace `ns` (an identifier, unique: B004, B002)". It does not say the namespace is Program-wide. I first wrote flows as `name("flow")`; then the same flow name in two accounts (`interest` in both, allowed by the sheet: "Inflow and outflow names are unique within an account") was refused with B002. I switched flow names to `data("string")` and check uniqueness and identifier form myself.
- API.md, the record: "opening arguments under their `as`, else namespace, else `name`". With two opening arguments (`name("account")`, `data({ opening })`) the second has no namespace, and "else `name`" reads as if it would land under the key `name`. I gave it `{ as: "options" }` to be sure; I had to probe the record with a throwaway `ctx.error(JSON.stringify(record))` to see its shape (`{ account, options: { opening }, calls }`).
- Pitfall 5, "A slot's `check` sees its own call already in the record (`ctx.program`)", hints but does not say that slot checks run at call time with the partial record. I relied on `ctx.program.account.at(-1)` being the current account, and confirmed it with a two-account probe.
- The `fix:` line of my construct-level errors prints my `tip` (e.g. "fix: an opening balance is at least 0") when I also gave `fix`: for U007 I passed both `tip` and `fix: "{ opening: 0 }"` and only the tip showed. Minor; the docs say "a tip or a fix" without saying which wins.

## What you guessed

- `month` representation: `scalar("f64")`, months since year 0 (`year * 12 + month - 1`); `monthOf` is an intrinsic with that `ref` and a JS spelling.
- `m` is one `object("the month (m)", { index, year, month, date })` type; `f` is `object(…, state.flows)` built per call by a convention function; `balance` is `"f64"`. One slot convention `flow` serves inflow, outflow and transfer.
- The space is named `month`, pure.
- `param` requires all of `value`, `min`, `max` (the sheet writes `{ value, min, max }`); no other param options.
- `start(year, month)` requires whole numbers; year has no range.
- A budget with no account is refused (U006), from "one or more `account`s".
- Flow names must be identifiers (U008), since lambdas read them as `f.name`.
- `.loan` is rejected on the root; the kit then refuses it on accounts too (children inherit). Its fix suggests an outflow.
- The text view's `state` is `{ accounts: string[], rows: [{ year, month, balances }] }`, printed as `2026-01` rows with one closing-balance column per account.
- Error codes: letter `U`, numbered U001–U010.

## Gaps

- **Per-construct-instance namespaces.** I needed "unique within this account" for flow names. Smallest change: `name("flow", { scope: "construct" })` (unique per instance), so B002/B004 and did-you-mean apply without hand-written checks.
- **"Not this instance" refs.** A transfer must not target its own account. Smallest change: `ref("account", { notSelf: true })`, or give slot checks `ctx.instance` (the current construct's record) so they need not guess it as `ctx.program.account.at(-1)`.
- **Ranges on data shapes.** `opening >= 0`, `horizon` 1–120 whole, month 1–12 and param `value` in `min..max` all needed hand checks. A shape like `"number>=0"` or `{ number: { min, max, whole } }` would cover them.
- Two accounts with one name print two B002 diagnostics for one mistake ("already declared as a account" — also "a account" — and "stateOf('a') could not tell the two apart").
- The L010 fix for an extra lambda parameter reads "This slot passes (the month (m), the flows declared so far in account 'a' (f) #3, x)": the label and the third parameter's name look garbled.

## Files

Opened: `START.md`, `API.md`, `dream-code.md`, `check.sh` (read with `cat` to see what it runs; I did not open the script it calls). Written: `budget.dialect.js`, `budget.grammar.js`, `examples/00.js` (the sheet's Program verbatim), `examples/01-same-flow-names.js`, `examples/02-block-body.js`, `examples/03-transfers.js`, this report; and the must-refuse probes `examples/r*.js`, each deleted after `check.sh` refused it. I opened nothing else under the repository.
