# Diagnostics and codes

Read this when you write your own checks, or meet a code you do not know.

## The letters

| Letter | What | When |
|---|---|---|
| `D…` | a bad definition (your Dialect or Grammar) | when the file loads |
| `B…` | a Program the builder refuses, or a builder-stage check | while the Program builds, and at `.check()`/`.build()` |
| `L…` | a lambda's error | only once the Program builds clean |
| `S…`, `P…` | the subset parser's syntax lines; an `S…` line may be a warning (`==` is S116), not a refusal | with the lambda checks |
| `C…` | the checker itself: C001 the file could not load the grammar or export a Program, C005 your definitions threw | any time |

**The order matters.** Any builder-stage error, including one from your own checks, stops lambda checking for that Program. So fix `B…` errors first, and do not judge a lambda rule by a Program that also fails a builder check.

Codes you will meet:

- **D**: D001 an unknown key, D002 an unknown type, D007 a name declared twice (also a member `environment` repeats), D010 a method-name clash, D011 an import from anywhere but `"kit/define"`, or a `ref` outside every instance its `within` names, D015 state without `record: "calls"`, D021 a bad effect declaration, D022 an instance reachable another way.
- **B**: B001 no such method, B002 a duplicate name, B003 a ref to nothing, B004 a bad value, B005 a required slot or child missing, B006 a second `once` call, B008 a free name not allowed, B009 a rejected name, B011 a convention's refusal, B012 a helper made by another function, B013 a name a lambda cannot see, B015 a param read by anything but its name, B016 the root opened twice, B017 a run that opens the root and returns something else.
- **L**: L002 a rejected member, L003 a type error (including the strictness options), L004 an effect its slot's `may` lacks, L007 a loop the kit cannot bound, or recursion, L012 an expression body where a block is required, L013 a write to a read-only member, L014 a helper parameter given two types, L017 a total changed other than by `+=` or `++`, L018 a handle used as a value.

Every diagnostic carries a tip or a fix: read it before guessing.

## Your own checks

Report with `ctx.error(code, message, { tip, arg, suggest, fix })`:

- **`code`**: one letter of your own and three digits. `B C D L P S U V` are reserved, and `ctx.error` with one throws.
- **`arg`**: an argument's position, or a path into it.
- **`fix`**: code to write instead. It prints as `fix: write <fix>`, so put advice in `tip`, not `fix`.
- **`tip`**: advice. The checker prints it on the same `fix:` line when there is no `fix`. With neither, the line reads `fix: no fix given: …`.
- **`suggest`**: a list of names. It appends its own "Did you mean 'x'?"; don't write one.

A slot's `check(call, ctx)` runs at the call. A construct's `check(record, ctx)` runs at `.check()`/`.build()`; the root's sees `units`. A root check cannot point at a helper or constant: its errors land on the export line.
