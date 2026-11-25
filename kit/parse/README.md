# kit/parse: the subset parser

Parses one runtime lambda from its source text (`String(fn)`), checks it against the runtime subset, and offers fixits. It has no dependencies and no Node built-ins, so it runs in the page.

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
| S109 | Spread `...` | |
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

**[`toplevel.js`](toplevel.js)** is a lexical scan of a whole program file, not a parser: `topLevelNames`, `topLevelBindings`, `topLevelRefs` (moved here from `scripts/dmg-oracle`, which re-exports them) and `buildTimeNames`, the names declared only below the top level. A Definition API host gathers a Program file's module scope with it ([kit/define](../define/README.md), "Module scope"). It first blanks comments, strings, regex literals and template text in place (`blank`, in [`blank.js`](blank.js), keeping each `${}` expression as code), so the top level is no bracket open however a line is indented, and several declarations may share a line. Brackets are matched by kind: a closer of another kind than the open bracket (left by a misread) closes nothing. A `/` is taken as a regex where an expression may start (after an operator, an opening bracket, a comma or a keyword such as `return`), after a `)` that closes an `if`, `while`, `for` or `with` head (`if (k) /\}/.test(s)`), and after a `}` that closes a block statement or a function declaration's body (`if (q) {}` then `/\{/.test(s)` on the next line), and as division elsewhere: after any other `)`, after an object literal's or a function expression's `}`, after a postfix `++` or `--`, and after a keyword used as a property name (`o.typeof / 2`). To tell them apart `blank` keeps a stack of the open brackets and what each opened: a `{` is an object literal after an operator, an opening bracket, a comma or a keyword such as `return`, and a block elsewhere. Names are Unicode (`ID_Start`, `ID_Continue`: `const τ = 6.28` is a name, and `τ / 2` division), and `of` is a keyword only directly inside a `for` head, a name elsewhere (`x / of / 2`). A statement without `;` ends at a line break the next line cannot continue: the next line starts with a name, a string or a number (not a template, which would make a tagged template), and the line before does not end in an operator or a comma; a next line starting `++` or `--` also ends it (a restricted production in JavaScript) unless the line before ends in an operator. `blank` reads only the text just before a `function` or an `await (`, so it is linear in the size of the file. A `{` after a top-level label (`l: {`) is a block. `topLevelBindings` throws a `ScanError` when it finds a name declared twice where one of the two is a `const` or `let`: a program cannot do that, so the scan misread the file, and a host vouching for a helper by its declaration must not keep either ([kit/define](../define/README.md), "Module scope"). `buildTimeBindings` is the part of `buildTimeNames` bound by `const`/`let`/`var` or `catch`, with no parameters or function names. `topLevelFunctions` gives each top-level function declaration (`export` and comments before it left out) with its whole text from `function` to the closing `}`, which is `String(fn)`, for a host to vouch for a function-declaration helper; `functionAsArrow(text)` writes the arrow that means the same (`function f(a) { … }` is `(a) => { … }`) or the reason it cannot (async, generator, no name). `topLevelBindings` gives each plain-named `const` and `let` with its `keyword` and its initializer's `init`: the source text from its first to its last character of code, so comments around it (a trailing `// note` on a line without `;`, a leading `/* doc */`) and parens that wrap all of it are left out. That is what `String(fn)` gives for an arrow written there, which the Definition API's helper check (`B012`) compares it with. Destructuring lists the names it binds (rest elements, renamed keys, defaulted names), never a default's value. It is a scan, not a parser: what it cannot see it gets wrong, and a misread can hide a real declaration or show a fake one, so the helper check can vouch for the wrong function (see [the backlog](../../project/backlog.md), "harden the module-scope scan"). Known misreads: a line comment, regex or string ends only at `\n`, not at `\r`, U+2028 or U+2029; a label after a statement with no `;` or after an `if (…)` head; a `/` after `default`, `extends`, a number ending in `.` or a prefix `++` is taken as division; a line break that ASI would not end a statement at when the next line starts with a name, such as one starting `in` or `instanceof`; a top-level `{` after the second of two labels (`a: b: {`) is taken as an object literal; an object literal after a ternary's `:` directly inside a block is taken as a block, so a `/` after its `}` may start a regex (it does only when another `/` closes one on that line); `yield` and `await` used as names start a regex after them; and `buildTimeNames` does not see the parameters of a function whose parameter list holds a paren (`function f(a = g()) {}`). Classes and imports are not listed.
