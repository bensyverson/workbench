
## Tests (required in this test of the kit)

Your package must test its runtime with a `tests` entry in its manifest. Tests are optional in the kit; this trial requires them, because it tests the tests design. Read docs/kit/package/README.md, "Tests", and docs/kit/API.md, "A runtime: defineRuntime", "Testing it". `./check.sh` runs yours on the kit.

Your tests must cover:

- **every Event input** your Dialect declares: a test sends records to it and expects what they do (for the input that steers the player: the player moves, and does not walk into a wall);
- **your pickup Event output**: a test expects the records a pickup pushes.

Write your tests only in the manifest. **Don't write a test harness outside it**: no script that imports your runtime, stubs `defineRuntime` or calls `step` itself, in your folder or anywhere else. If the tests entry cannot say something you want to test, that is a gap: report it.

`./check.sh` now also checks and runs your tests: K002, K020 or K021 for an entry that is misshapen or names what your Dialect lacks; H006 to H008 for a test that fails; T030 when there are no tests; T031 for an Event input no test sends a record to. It prints `tests: <n> of <m> passed`.

In REPORT.md, add a section **Tests** right after **Gaps**: how hard the tests were to write, where the tests draft misled you or left you guessing, and anything you wanted to test that it cannot say.
