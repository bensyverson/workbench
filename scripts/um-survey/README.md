# Uncommon Math survey

Finds the fragment-style sketches in the Uncommon Math book and prints what each one uses. It exists so the H3 sketch choice in [the finding](../../project/2026-11-23-uncommon-math-sketches.md) can be re-run. The book is `local/uncommon-math-0.1.0.html`, a gitignored single-page app that lives only in the main checkout; the script reads it by absolute path and copies nothing into the repo.

```
node scripts/um-survey/survey.js                      # one row per sketch, then a subset-code summary
node scripts/um-survey/survey.js --kind frag          # frag | pixel-loop | canvas
node scripts/um-survey/survey.js --sketch 04-noise/domain-warp   # detail: params, Math calls, every function
node scripts/um-survey/survey.js --kind pixel-loop --detail      # detail for a whole kind
node scripts/um-survey/survey.js --json               # everything, machine-readable
node scripts/um-survey/survey.js --book <path>        # another copy of the page (default: the main checkout's)
```

- `book.js`: `loadBook(path)` reads the `<script id="book-data">` JSON: chapters (Markdown text), `sketches` (each a CommonJS source string with `title`, `about`, `chapter`) and `demos`.
- `units.js`: `topLevelUnits(src)` splits a sketch at its column-0 statements (one unit per `const` declarator); `asArrow(unit)` rewrites a function unit as the one arrow function `kit/parse` accepts.
- `analyze.js`: `classify(src)` and `analyze(src)`, which parse every function unit with `kit/parse` and walk the trees.
- `test/units.test.js`: pins the splitting and the rewrite.

## What it prints

The header counts sketches, chapters, demos and the ```` ```glsl ```` listings in chapter text. Then, per sketch:

- `kind`: `frag` exports `frag(px, py, env)` and no `draw`, which the book calls once per pixel; `pixel-loop` has a `draw` that fills an `ImageData` in its own pixel loop; `canvas` has a `draw` that issues canvas calls and no pixel buffer. This is a text heuristic (`putImageData` plus `createImageData`/`new ImageData`/`getImageData`); a `pixel-loop` can still be mostly canvas drawing.
- `fns` and `subset`: the sketch's function units, and how many of the non-hosted ones (everything but `draw`, `setup`, `meta`) parse and pass `checkSubset` with no error. A function with a parse error counts as not clean.
- `loops`: every `for` as `for<bound` when the bound is a literal, `for<dyn` otherwise (bounds from params or array lengths), plus `forof` and `while`.
- `noise`, `tex`, `state`, `ints`: a function whose name looks like a hash or noise (or a call to one); a texture or pixel read (`getImageData`, `texel`, `sample`, `drawImage`, comments removed); `setup` or `state` in the code; bitwise operators or `Math.imul`.
- `Math`: the `Math.*` functions called.

The last block counts the non-clean functions by `kit/parse` code (see [the parser's table](../parse/README.md#codes)).

## Limits

- Only top-level functions are analyzed. An arrow stored in an object or array literal (`const maps = { swirl: … }`, `const T = [ … ]`) and an arrow nested in another function are part of their unit, so `S111` flags the nesting but their own bodies are not checked.
- `kit/parse` checks syntax, not free identifiers or types, so `clean` means "inside the subset's syntax", not "lowers".
- The survey does not run the sketches. `params` come from evaluating each sketch's top level once (no `draw`, `frag` or `setup` call), as the book does when it loads one.
