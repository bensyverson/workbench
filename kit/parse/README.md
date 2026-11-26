# kit/parse: the subset parser

Parses one runtime lambda from its source text (`String(fn)`), checks it against the runtime subset, and offers fixits. The lambda parser has no dependencies and no Node built-ins, so it runs in the page; the whole-file scan (`toplevel.js`, below) reads a syntax tree from the vendored acorn.

```js
import { parseLambda, checkSubset, applyEdits } from "./kit/parse/index.js";

const r = parseLambda(String(fn));           // { ok, ast, diagnostics }: never throws on bad input
if (r.ok) {
  const ds = checkSubset(r.ast, src);        // every subset violation, in source order
  const fixed = applyEdits(src, ds.flatMap((d) => d.edits ?? []));
}
```

- **The tree** is an ESTree subset ([`ast.d.ts`](ast.d.ts)). Every node has `loc` (line from 1, column from 0, relative to the lambda) and `range` (offsets).
- **A diagnostic** has `code`, `severity`, `message`, a one-line `tip`, `loc` and `range`. Where the rewrite is mechanical it also has `edits`, which `applyEdits` applies.
- **Parse broadly, check separately.** The parser reads more than the subset allows, so the check can report everything at once. A dialect narrows the subset by passing extra rules to `checkSubset`; it never removes these. The rulings are in [the M1 plan](../../project/2026-11-23-m1-game-slice-plan.md), "Parser rulings".
- **Not checked here:** free identifiers, whether a callback's callee is a declared query, loop bounds, and types. Lowering does those.

## Codes

| Code | Meaning | Fixit |
|---|---|---|
| P001 | Unexpected token or character | |
| P002 | Unterminated string, template or comment | |
| P003 | The source is not exactly one arrow function | |
| P004 | Unsupported syntax: switch, class, function, try, throw, async/await, regex, labels, getters, object methods, for…in, rest elements | |
| P005 | Invalid assignment or update target | |
| S101 | `while` / `do…while`: no checkable bound | |
| S102 | `new` | |
| S103 | `this` | |
| S104 | Template literal | to `+` concatenation, parenthesized where needed |
| S105 | Optional chaining `?.` | |
| S106 | `typeof`, `void`, `delete` | |
| S107 | `in`, `instanceof` | |
| S108 | Comma operator | |
| S109 | Spread `...` outside an array literal (inside one it is list concatenation, checked by kit/lower) | |
| S110 | `var` | to `let`, when safe (see below) |
| S111 | An arrow that is not a call argument (a closure) | |
| S112 | A `for` loop with no condition | |
| S113 | Computed object key | |
| S114 | Default value in a parameter or pattern | |
| S116 | Loose `==` / `!=` (a warning), except against a `null` literal: `x != null` is the kit's null check ([kit/lower](../lower/README.md)) | none: `x == undefined` also matches null |

**The S110 fixit** is offered only when `let` cannot change the meaning: the `var` is a direct statement of the lambda's top-level block (not inside an `if`, loop or nested block), no name it declares is read before or in its own declarator, and no name is declared twice (a parameter counts). Otherwise S110 is still an error with its tip, and no edit.

**Spans** follow ESTree. A parenthesized node's own `range` excludes its parentheses, and a parent whose first operand is parenthesized starts at the `(`. A `TemplateElement` spans only its text.

**What the parser rejects that JavaScript also rejects** (as P001 unless noted): `??` mixed with `||` / `&&`, reserved words as names, parenthesized patterns, `{ k = 4 }` outside a pattern, a line break before `=>`, an arrow as an operand or callee, malformed numbers, legacy octal numbers and escapes (`010`, `"\1"`; `"\0"` is fine), assignment through `?.`, `const` without a value, a lexical declaration as a statement body, duplicate parameters and redeclarations, HTML-like comments, and nesting too deep to parse. `for…in` is P004.

`node scripts/parse-corpus.js` runs the parser and check over every DMG runtime lambda.

**[`toplevel.js`](toplevel.js)** reads a whole program file from its syntax tree: it parses the file as an ES module with the vendored acorn ([`module.js`](module.js) is the one module in the kit that imports it, and [kit/package](../package/README.md) takes its trees from there too; see [kit/vendor/acorn](../vendor/acorn/README.md)) and walks the tree. A host gathers a Program file's module scope with it ([kit/define](../define/README.md), "Module scope"), and vouches for a top-level helper by comparing its text with `String(fn)` (`B012`), so what it cannot read it refuses: **a file that does not parse as a module throws a `ScanError`** from every function below (`line` is the parser's line; `binding` is set when the error is a name declared twice, which a module cannot do). A tree too deep to walk (an operator chain of a few thousand terms) is a `ScanError` too, as is a `/` that acorn reads as the start of a regex right after `?.` and a property name (it takes a keyword-named one for a keyword) (`o?.in\n/ 2`; a regex after `?.[` or `?.(` is fine; JavaScript reads a division, and the regex could hide a declaration). A module is strict, so a `with`, a legacy octal or a function declared twice at the top level is refused too, as Node would refuse to load it.

- `topLevelNames(code)`: the names a statement of the program itself declares, in source order: every name a `const`, `let` or `var` binds (destructuring included) and each function declaration's name (`export` and `export default` too). A loop's variable, a block's declarations, classes and imports are not listed.
- `topLevelBindings(code)`: each plain-named `const` and `let` with a value, as `{ name, keyword, init }`. `init` is the initializer's exact source text, from the first to the last character of code (the comments around it and any parens that wrap all of it are left out), which is what `String(fn)` gives for an arrow written there. Destructuring, `var` and functions are not listed.
- `topLevelFunctions(code)`: each top-level function declaration, async functions and generators too, as `{ name, init }` with its whole text from `function` (or `async`) to the closing `}`, `export` left out. `functionAsArrow(text)` writes the arrow that means the same (`function f(a) { … }` is `(a) => { … }`) or `{ error }` for async, a generator, no name, or text that is not one function declaration.
- `buildTimeNames(code)`: the names declared only below the top level: locals, parameters (a top-level helper's too), function and class names, loop and `catch` variables. `buildTimeBindings(code)` is the part bound by `const`/`let`/`var` or `catch`, with no parameters or function names.
- `buildTimeShadows(code)`: the names declared both at the top level and in the export's build code, which the kit refuses a lambda to read (`B013`). Build code is the export's block body and every function written with the `function` keyword below the top level or as a method (parameters, locals, nested functions); beyond it a name counts when the function that binds it holds another function, wherever that is written (a `const` arrow exported by name, `export { f as default }`, a build-time callback in the export's expression, an IIFE). A function that holds no function (a lambda's or a helper's own parameter) never counts. The export's own parameter counts when the export holds a function (`export default (k) => { [1].map((x) => x); return 1 }` lists `k`: a lambda inside it could read `k`) and never otherwise, since an export with no function in it has no lambda to read the name; excluding it in the first case would fail open.
- `topLevelRefs(src, names)`: which of `names` the lambda source `src` (one expression: an arrow or a function) reads from outside itself, in `names` order. It resolves scopes as JavaScript does (`freenames.js`): a property name after `.`, an object key, a label, text in strings and comments, and a name the lambda declares in a scope that holds the read do not count; a shorthand `{ a }` and an assignment to a name do.

What is still approximate (the first two fail closed, the third can fail open for one name):

- **A lambda is told from a callback only by shape.** The tree cannot say which nested function is a Runtime Lambda handed to the builder and which is a build-time callback holding one, so any nested function counts: a top-level helper whose parameter shares a top-level name and holds a callback is listed in `buildTimeShadows`, and so is a Runtime Lambda's own parameter when the lambda holds a query callback (`(p, dt) => p.items.some((q) => q.x > dt)` lists `dt`, and another lambda's read of a top-level `dt` is then `B013`; issue `JYmuWM`). Telling them apart takes the builder's knowledge of which arrows it was handed.
- **A file's top level is its program statements.** A `var` inside a top-level block or loop is below the top level for the scan, though JavaScript hoists it to the module.
- **acorn 8.19 reads a `/` after `?.` and a keyword-named property as the start of a regex** (`o?.return / 2`, `o?.in / 2`); V8 reads division. On one line that is a syntax error, so the file is refused. Across a line break (`o?.return` then `/ x /.test(s)` on the next line) acorn splits the statement, which can hide a declaration inside what it took for a regex (fails open for that name; the helper check then has no text to vouch with). Not fixable here: the vendored build is unmodified.
- **`blank(text)`** (in `module.js`, for `kit/define/ui/elements.js` and the trial checkers: comments, strings, regex literals and template text in place as spaces, `${` as ` (`) reads a module with the tree, so a `/` is exact; text that is no module (a method's source) is tokenized as far as it goes, and a `/` there is guessed from the token before it.
