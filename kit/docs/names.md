# Names, namespaces and refs

Read this when a name must be unique only inside one instance (a flow within an account), or a `ref` must resolve there.

- **`name(ns)`** declares a name in namespace `ns`. A namespace spans the **whole Program**: two declarations of one name anywhere are B002.
- **`name(ns, { within: "account" })`** makes it unique only within each `account` instance: the construct declaring it, or an ancestor. A `state` construct's names stay Program-wide, so they cannot repeat.
- **`ref(ns)`** names a declared one, earlier or later in the Program (B003, with a did-you-mean). When `ns` has `within`, the ref resolves within the enclosing instance. A `ref` outside every such instance is D011.
- **The shape of a name:** a JavaScript identifier. `_x` and `h$t` pass; `9jet` and `a-b` are B004. No option narrows it: refuse more with your own check. The root's opening name, the Program's own, is any non-empty string.
- **`ref` inside a shape** works too: `data({ forces: listOf(ref("force")) })`.
- **Record keys:** an opening argument's spec takes `{ as: "key" }` last to name its record key; a slot's `as` names the slot's key ([record.md](record.md)).
