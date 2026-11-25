# Construct state and convention functions

Read this when a lambda's parameter types depend on what the Program declared earlier (columns derived so far, fields declared, which instance it belongs to).

## A convention function

A slot convention is `{ params, returns, space }` (`returns: "infer"` takes the body's type), or a function `(ref, program, state) => convention`.

- **Lowering may call it several times per lambda,** so it must be a pure function of its arguments.
- **`ref`** is `{ id, kind, on, index, key }`:
  - `on`: the instance's name;
  - `index`: the call's position among the instance's calls (without `record: "calls"`, counted slot by slot in declaration order);
  - `key`: the declared name when the slot's first argument is a `name()` (a lambda's `recordOf` key wins).
- **`program`** is the whole record, `units` included.
- **`state`** is the construct's state just before this call.
- **Return a string instead to refuse the lambda** (B011, with your string as the reason).

```js
step: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row" }),
```

## Construct state

A construct declares `state: { init, step, names }`:

```js
state: {
  init(opened, { program, stateOf }) { return { columns: { ...program.source[opened.from].columns } }; },
  step(state, call, inferred, ctx) {       // after each call; returns the next state
    if (call.slot === "derive") return { columns: { ...state.columns, [call.args[0]]: inferred } };
    return state;
  },
  names: { column: (state) => Object.keys(state.columns) },   // ref("column") resolves here, per step
},
```

- **State needs `record: "calls"`** (D015 without it).
- **State exists only at lowering.** `.check()` and slot checks never see it (`ctx.state` is undefined). Anything that depends on the state at a step belongs in `state.names`, a convention function, or `step`'s `ctx.error`.
- **`init` reads other declarations from the record** by their record key: `program.source[opened.from]` is the `source` slot's object by name ([record.md](record.md)).
- **Another instance's final state** is `stateOf(name)`, available to both `init` and `step` (`ctx.stateOf`).
- **`inferred`** is the inferred type of the call's lambda, in definition terms (`"f64"`, a vector's name, `enumOf`, `opt` …). For a call with several lambdas it is an object by key (all keyed) or a list in call order (all unkeyed).
- **A `stateOf` loop is B010.**
