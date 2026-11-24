# kit/define review probes

Failing tests from the independent review of `kit/define` (commit 61faf0a, 2026-11-24). Each is the red test of a fix leaf (found-in `38WI7z`): run one with `node --test scripts/define-probes/<name>.probe.js`. They are named `*.probe.js` so `npm test` skips them; when a fix lands, move its probe into `kit/define/test/` as a `.test.js`. `free.probe.js` passes and is coverage for the free-name rule.

| Probe | Leaf |
|---|---|
| `lower-drops.probe.js` | P1 `OTTd8r`, P2/P2b `3t38w5`, P3/P5 nits `qCA7Tl` |
| `as-collide.probe.js` | `ULagYc` |
| `probe-names.probe.js` | `1vFLxi` |
| `opens-lambda.probe.js` | `uIlROy` |
| `pinning.probe.js` | `BGzGkD` |
| `proxy.probe.js` | nit in `qCA7Tl` (string coercion) |
