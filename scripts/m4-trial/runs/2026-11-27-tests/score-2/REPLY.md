*The leg's closing reply, saved by the integrator (tests-dogfood-38).*

**Difficulty: 2 out of 5.**

I built the `tally` package in `tally/` and wrote `REPORT.md`. `./check.sh tally` exits 0 on both runs, with 3 of 3 manifest tests passing and no violations.

The hardest part was the end of the round. A step can pick up a record after the time is up that was actually sent before it, so the runtime judges each record by when it was sent (`$T`), not by which step takes it. A test sends records just before, exactly at, just after and well after the end, and only the earlier ones count. The main limit of the testing is that the draft tests can only read state: they can't check the value outputs by name or anything in the picture, so the green colour at the goal is untested.
