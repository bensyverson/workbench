# kit/interp: the reference interpreter

What a Kernel means, by walking its IR. It is M2's oracle: with typed operators a fields Lambda has no runnable closure, so the JS and GLSL outputs are compared against this. It is small and slow on purpose ("obviously correct beats fast"), and it shares nothing with `kit/emit/js` beyond the IR's types. No Node built-ins.

```js
import { run, coerce } from "./kit/interp/index.js";

run(kernel, [uv, uniforms], env);          // inputs by position, or { uv, u } by parameter name
run(kernel, inputs, { helpers, intrinsics: INTRINSICS, onNode: (e) => … });
```

`env` is `RunEnv` in [`interp.d.ts`](interp.d.ts). Everything a Kernel reaches outside itself comes from it:

| Field | What it supplies |
|---|---|
| `helpers` | `helper` nodes: name to a Kernel (interpreted) or a plain function |
| `methods` | `method` nodes of the program, `Owner.name` to a Kernel run with the receiver first; a method not listed is the receiver's own |
| `intrinsics` | a Dialect's intrinsics, by the name a Kernel calls: `{ ref, componentwise }`, as the fields Dialect's `INTRINSICS` already are |
| `globals` | what a `global` node names (`Math`) |
| `host.store` | takes over a `store`, given the raw and the coerced value (default: assign the coerced one) |
| `onNode` | the per-node hook (below) |
| `maxSteps`, `maxDepth` | the budget: loop passes plus calls (10 million) and call nesting (200); passing either is an error, not a hang |

## Semantics

- **Numbers.** An `f64` is a JS double. An `f32` is a double that `Math.fround` has rounded, and every expression's result is rounded to its type (`fit` in `values.js`), so an f32 `add` is the double sum rounded once, which is the correctly rounded single-precision sum. Inputs and loads are rounded to their declared type too.
- **Vectors** are arrays of their components (a `vec` node builds one; `field` `x`…`w` reads one). `add`, `sub`, `mul`, `div`, `neg`, `pos` are componentwise; a scalar broadcasts only where the verifier's `OPS` allow it (`mul` either side, `div` on the right). The rest is refused with an error rather than guessed: the interpreter is stricter than JavaScript where the IR is.
- **Nominal scalars** (a Dialect's `date`) are their backing f64, compared as numbers; the IR gives them no other operator.
- **Operators** are JavaScript's (`rem` is `%`, the bitwise ones go through int32). `and`, `or` and `cond` are lazy. Operands, call arguments and array items are evaluated left to right, a call's receiver first.
- **Stores** apply the place's rule with `coerce` ([`coerce.js`](coerce.js)): a sized integer truncates toward zero, clamps to `min`/`max`, then wraps; `fix` rounds to 1/256, clamps, then wraps into [-128, 128); `f64`/`f32` refuse a non-finite value; `bool` stores truthiness; `enum` refuses a string outside its values. Refusing is a `TypeError`, as the DMG host does. The host's wrap and fraction *warnings* are not reproduced: a host that logs them takes over the store with `host.store` and receives the raw value.
- **Intrinsics** run their reference implementation (`ref`), never the Dialect's JS or GLSL spelling, so a spelling that disagrees with its reference is caught by a comparison. A `componentwise` one runs once per component of its vector arguments (scalars are passed whole); any other gets every vector argument's components spread (`length` is `Math.hypot`). The result is rounded to the call's type. Lowering gives a Dialect's bare function (`length(v)`) a `global` receiver of its own name; the interpreter does not evaluate it.
- **Calls** that are not intrinsics go to the host: `recv.name(args)`, or `recv(args)` when `fn` has no dot (`at(0, 0)`).
- **Loops** are bounded by the IR: `each` over more than its `max` items is an error.

## The per-node hook

`onNode(event)` is called after each node finishes, in evaluation order (operands before their operator, a statement after its expressions, a helper's nodes before the call's result):

```js
{ kind, stmt, span, value, path, kernel, depth }
```

`span` indexes `kernel`'s `src`; `path` locates the node as the verifier writes it (`body[0].then[1].value.args[0]`); `value` is the expression's result (a vector as its array), or for a statement the value it handled (a `let`'s, a `store`'s, a `return`'s); `depth` is how many kernel calls deep it ran. A branch not taken reports nothing, and a loop reports each pass. The hook cannot change the run, and a hook that throws stops it, which is how a debugger breaks.

## Tests

- `test/ops.test.js`, `test/nodes.test.js`, `test/coerce.test.js`, `test/hook.test.js`: one test per operator and per node kind, over hand-written IR (`test/build.js`, whose `kernel()` runs the verifier on everything it makes).
- `test/fields.test.js`: lowers the fields sketches `swirl` and `bulge` and runs their pixel Kernels at seven points, against the book's own `maps` and `grid` (rewritten in doubles): the colors match exactly.
- `test/fields-book.test.js`: runs `domain-warp` over 270 pixels (fog, grey and marble; levels 0, 1 and 2; four values of `t`) against the book's own `frag`, evaluated from `local/uncommon-math-0.1.0.html`; it skips with a message when the book is absent. **Observed maximum difference 5.1e-4 per color component; the test's tolerance is 2e-3** (four times that, about half a step of an 8-bit channel). `node --import ./kit/test/verify-lowering.js --test kit/interp/test/fields-book.test.js` prints the figure.
- `scripts/dmg-lower/test/interp-oracle.test.js`: the M1 Kernels. Every lambda of presets 04-07 that lowers (all 25 slots) is run by the interpreter instead of the DMG closure, alone and then all at once, over a seeded 600-frame trace with `host.store` handing the raw value to the DMG proxies. The traces equal the original's, so the interpreter agrees with the emitted JS, which is held to the same traces by `emit-oracle.test.js`. A planted fault (every store off by one) changes the trace.
