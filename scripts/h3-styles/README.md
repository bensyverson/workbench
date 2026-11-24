# H3 styles comparison

Measures the three survey sketches (`swirl`, `bulge`, `domain-warp`) in the typed-operator style and the call style (`vadd`, `vscale`, ...): lines, characters, tokens, longest line and deepest parenthesis nesting of the Program's own Lambdas.

```
node scripts/h3-styles/measure.js          # a Markdown table
node scripts/h3-styles/measure.js --json   # the raw numbers
```

The sketches are in [kit/dialects/fields/programs](../../kit/dialects/fields/programs/) (`*-calls.js` is the call style); the findings are in [project/2026-11-23-h3-styles-comparison.md](../../project/2026-11-23-h3-styles-comparison.md).
