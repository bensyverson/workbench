# The brief for the added hidden programs

*2026-11-25, leaf `JWdGeK`. The text a fresh author got, word for word, run as `claude -p --model claude-opus-5-5` in `/private/tmp/3d093c96-hidden/`. The folder held the sheet (`dream-code.md`), the hidden set's `README.md` and `CHANGES.md`, and three existing programs for their form (`accept/a02.js`, `reject/r02.js`, `reject/r23.js`). The author saw no kit document, no implementation and no hand-in. Why these topics: the first H5 run found that the hidden set does not test them ([project/2026-11-25-h5-run.md](../../../project/2026-11-25-h5-run.md)).*

---

You write test programs for a small language. Work only in the current folder. Read `dream-code.md` (the language's sheet, the only spec), `README.md` (one line per existing test program) and the three programs in `accept/` and `reject/` (their form). Do not open anything outside this folder, and do not search the web.

The existing set misses some rules the sheet states. Add programs for these, judged only from `dream-code.md`:

1. A number used as a condition: in `if`, in a ternary, as an operand of `!`, and of `&&` or `||` (each its own reject).
2. Vector times vector, and a number divided by a vector (rejects).
3. A block-body rate lambda with a path that ends without `return` (reject).
4. A top-level helper that nothing calls, which assigns a particle field, which calls `p.kill()`, which uses a counter, and which calls itself (each its own reject).
5. A helper called with a number in one place and a vector in another, each call well typed (accept), and a helper whose paths return different types (reject).
6. An `update` lambda with an expression body (reject).

Rules for each file:
- A reject file is a valid Program with exactly one mistake. Its first line is `// REJECT <n>: <what it does>`, where `<n>` is the refusal number the sheet's "Which number" paragraph gives. An accept file's first line is `// ACCEPT: <what it tests>`.
- Name the files after the existing ones: rejects `r<n><letter>.js`, continuing each number's letters past the last one `README.md` lists; accepts `a28.js` onward.
- Programs import `{ particles } from "../particles.grammar.js"` and export the Program as the existing ones do.
- If the sheet does not decide a case, say so in the file's first line with `RISKY (<why>)`, as `README.md` does.

Then add one line per new file to `README.md`, in its section and style, and a dated entry to `CHANGES.md` listing the files. When done, reply with the list of files and every case you marked RISKY.
