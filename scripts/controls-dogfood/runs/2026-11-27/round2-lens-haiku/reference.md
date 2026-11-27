# Reference: declared Controls (a draft; nothing here is built)

Snippets here use placeholders (`<control>`, `<part>`, `<input>`, `<button>`, `<code>`). They are never names the kit knows.

## What changes, in one paragraph

The kit stops knowing any control. `PAGE_CONTROLS`, the host's fixed pad and four buttons, retires, and so do the second mechanism beside it (defineUI's `inputs`, its `role` list, `ui.control`, `controlName`) and keys.js's fixed targets. In their place a package's UI declares **Controls**: each one named, of a kind from a closed list of interaction kinds (buttons, a number, a choice, text, a pick from a data file, a point list, triggers, and a few more), and each bound by its name to the Dialect's Event input of that name. defineUI checks that the control's records fit the input's seam, so a misfit is an error before any run. In a composition, the page part's outputs are the Controls of the composed parts' UIs (`page.out.<control>`), wired by the glue as today. A part run alone gets each Control wired to its input by name. Nothing is inferred from seams. Around that core the stage gets pointer input routed to the part whose op is under the pointer, **Grips** (draggable stage objects bound to a param or a builder argument), source **write-back** of literals through the vendored acorn, an editor stage, tabs, view tiles, actions, device adapters (keys, on-screen, gamepad, MIDI) and one "click to start" gesture.

## The thirteen requirements, settled

Each is built in this stage unless it says otherwise; where part of one is later, the reason is that nothing exists yet for it to act on.

### 1. Declared, named Controls, bound by name and checked by seam

**Settled.** A Control is declared under `controls` in a package's `defineUI`. Its name is the name of one of the Dialect's Event inputs: that is the binding, and the only one. defineUI compares the record seam the Control's kind makes ([the kind table](#the-kinds), below) with the input's seam through kit/seam's `compareSeams`: any problem is **U016**, naming both seams. A dropped field (a field the Control sends that the input leaves out) and a filled one (a field the input defaults) are fine, as on any wire. A name that is not an Event input is **U015** (with a did-you-mean, and "an Event input" when it names a value input).

```js
// <package>.dialect.js
ports: { in: { <input>: { seam: "Event<{ <field>: <type>, … }>", note: "<what one record means>" } } },

// <package>.ui.js
export const <ui> = defineUI(<builder>, {
  controls: {
    <input>: { kind: "<kind>", label: "<label>", <kind's keys> },
  },
});
```

- **A Control's declaration, whole.**
  - The declaration holds the kind's keys, the required ones too (`min`, `max`, `value` for a `number`), so a Control without `each` and one with it look the same. An `each` entry's keys merge over the declaration's: an entry usually gives `key`, `label`, `value` and `to`.
  - A Control may have **both** an input of its name and a `to`. The input carries the live value; `to` commits the release to source (requirement 8). With no input, the Control is part-local and `to` is required, in the declaration or in every entry.
  - A Control's `to` is a string (a fixed target) or, per entry, a string `each` builds from the record. It is build-time: it reads the built record, never run state. A Grip's `to` is a lambda over run state, because a Grip sits on something the runtime computes. A Control that needs a per-item target in run state is a Grip, or a keyed Control over the record.
- **Declared by a Program**. A Control may take `each: (record) => [{ key: "<key>", label?, value?, to?, <kind's keys> }]`, plain build-time JavaScript over the built record, as `extent(record)` and `edges(record)` are in a Dialect. Each entry is one instance of the Control, so a Program that declares <n> constructs gets <n> Controls. A keyed Control's record gains `key: str`, and its input's seam must take it (U016). `<ui>.lower(record)` calls `each` and checks what it returns (**U017** at lower, with the instance's path).
- **A Program's stage UI** (shapes the person plays) needs nothing more: the Program's shapes are draw ops with an `id`, and the pointer reaches the part with the `id` of the op under it (requirements 5 and 6).

### 2. Value kinds beyond buttons

**Settled:** the closed kind table below, built now. These kinds are UI vocabulary (a number, a choice, a point list), not any workbench's. Every kind sends a **state** record (the whole value now) except `triggers`, which sends **delta** records (requirement 3).

- **A slider, number or knob** is the `number` kind: `min`, `max`, `value` (the start and reset value), `step?`, `curve: "linear" | "log"`, and `look: "slider" | "knob" | "field"`. A log curve needs `min` above 0, for a Control (U017) and for a param's annotation (U012) alike: a log knob has no zero, so a volume that must reach silence is linear, or has a small floor as its `min`. Every look has fine-drag (Shift: a tenth of the speed), reset (a double-click sets `value`) and typed entry. `look` is a hint to the host. The record is the same for every look.
- **vec2 and vec3 entry, color, an enum dropdown** are `vector`, `color` and `choice`. A color is `vec3`, sRGB components from 0 to 1, because a Kernel computes with it and Bench cannot parse hex text. Draw colors are hex text, so a Draw builder cannot use one yet.
- **A catalog picker over a data file** is `pick`: `file` names an entry of the Dialect's `files` (an entry is `{ kind: "csv" | "json", path: "<path>", note: "<note>" }`, kit/define's D034;), `key` its key column, `show` the columns listed, `map: { x, y }` two columns to scatter the rows on , and `carry: { <column>: "f64" | "str" }`, the columns sent with the key. The record is `{ value: str, <column>: … }`, so a runtime gets the row it needs without reading the file. A runtime also gets the package's data files as `ctx.files` (this stage builds both).
- **Text entry** is `text`. Its record is the whole text, coalesced to one record a frame. Bench cannot read a string's characters, so a runtime (trusted JS) reads it. While a text Control has focus, it takes every key and no other Control gets one.
- **Structured values:**
  - a point list is `points` (`max`, `x: [<min>, <max>]`, `y: [<min>, <max>]`, `value`), whose record is `{ value: list<vec2, <max>> }`;
  - a value that belongs to each construct of a Program is any kind with `each(record)`: one keyed instance per construct (requirement 1), live through the input and, with `to`, written back to the construct's literal (requirement 8).
- **Params** keep their generated view, so each param is a Control with no declaration: a number with `min` and `max` is a `number`, a string with `options` a `choice`, a bool a `toggle`, any other string `text`. `annotate.params.<name>` gains `look`, `curve` and `step`, so a param can be a log knob. A param edit stays a logged `param` input, and the release writes the declared `value` back (requirement 8).

**Why an input and not a param for the new kinds.** A param is a flat scalar per Program, read by Kernels as `$`, and a change to one a build-time read saw rebuilds the part. Vectors, colors, point lists and keyed values do not fit that model without a params redesign. An Event input carries any seam and lets the runtime keep the value in its state. This was checked against the two non-founding examples in the repo: fields has only number params, so a `number` param serves it unchanged; data's controls are choices and dates over params (`choice`, `text`), which also serve unchanged. Both need nothing here beyond the generated view.

### 3. Two record kinds

**Settled.** The kind decides the class, and the composed page records it for each Control (`records: "state" | "delta"`):
- **State** records (buttons, toggle, number, vector, color, choice, text, pick, points) fold as a page wire folds today: past the consumer's max, a step takes the first max − 1 records in order, then the latest. So a tap's press and release both arrive, and the final release always does. A keyed state Control folds per key: of a key's waiting records, only its latest is taken.
- **Delta** records (`triggers`; the pointer's down, up, cancel and wheel, requirement 5) are **never folded and never dropped**. Past the consumer's max, they **carry over**: the step takes the first max in order, and the rest wait for the next step in the same order, each keeping its own `$T`. A person cannot be refused, and a note cannot be lost, so the cost of a burst is latency, never loss. `stats().carried` counts them. The first carried record of a wire notes N001 once (a warning).
- `PAGE_CHANGES_PER_FRAME` (2 for every Control) retires. Each kind has a default **`perFrame`**, the records one Control sends in a display frame, which a declaration may raise: buttons 2 (a press and a release), triggers 32 (sixteen notes on and sixteen off), the pointer 8, and 1 for every other kind (the host coalesces their changes to one a frame). The page's sizing runtime is made from these (S116), and S116's warning on a page wire names what happens past the max: "folds" or "carries over". A four-note chord in one frame is 4 records against triggers' 32, and arrives whole. `perFrame` counts **records, not presses**: a `buttons` record holds every button, so one Control with six buttons still sends two a frame, and the default needs no raising for a crowd of buttons.

### 4. One declared input, many hosts

**Settled.** A kind is device-free. The host chooses an adapter per kind, and the declaration may give each adapter its defaults:

| Adapter | Built now as | For |
|---|---|---|
| keys | `keys` in the declaration, by `KeyboardEvent.code`; the host's key map may replace any of them | buttons (`keys: { <button>: ["<code>", …] }`), toggle (`keys: ["<code>"]`), number (`keys: { down: […], up: […] }` nudges by `step`), choice (`keys: { prev: […], next: […] }`), triggers (`keys: ["<code>", …]`: the i-th code fires index `first + i`) |
| on-screen | generated from the kind, in the generated `controls` view or a tile's `control` component | every kind; buttons lay out by `grid: [[<button> \| null, …], …]` when given, else in a row |
| gamepad | `gamepad: { <button>: <index> }`, `gamepad: { axis: <index> }` | buttons, number |
| MIDI | `midi: { notes: true, channel?: <n> }`, `midi: { cc: <n>, channel?: <n> }` | triggers (note on and off, velocity / 127; a note on with velocity 0 is off), number (a CC scaled to `min..max` by `curve`) |

- **Several codes, partial maps, collisions.**
  - A button with several codes is held while any one is down, and released when none is.
  - `keys` and `gamepad` may name some of a Control's buttons; an unnamed one is played on screen only.
  - A `gamepad` index is the browser's standard-layout index (12 to 15 are the directions of the D-pad).
  - **S121** (a warning): two different Controls of one composition bind one `KeyboardEvent.code`. The first declared wins the key and the warning names both, since one keyboard has one meaning per key.
- **Device-only fields.** The page always sends every field of a kind's record, and an adapter without one sends the neutral value (keys send `velocity: 1`). A Dialect that does not need a field leaves it out of its input's seam, and the wire drops it. So velocity is optional where it matters, on the consumer's side, with no new mechanism.
- **A device's timestamp is the stamp.** The host passes the event's own time (`event.timeStamp`, or a MIDI message's), and kit/page maps it onto T through the driver's last frame: `page.stampOf(ms)`, never at or before the last instant run (then the first millisecond after it), and the next instant while paused. The input log keeps the stamp, so `$T` is the device time and a replay gives the same. A note struck mid-frame reaches its part with the time it was struck.
- The default keys are the package's, never the kit's. `DEFAULT_KEYS` and `KEY_TARGETS` retire. createPage's `keys` option becomes a host override, `{ "<code>": "<target>" }`, where a target is `<control>.<button>`, `<control>[<i>]`, `<control>.up` or `<control>.down`, `<control>.prev` or `<control>.next`, or `<control>` for a toggle.

### 5. Pointer input on the stage

**Settled.** A UI names the Event input that takes pointer events on a shown Draw output: `stage: { draw: "<output>", pointer: "<input>" }`, and the same `pointer` key on a `view` component (requirement 9). The kit fixes the seam, in the output's own frame:

```
Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@<frame>, pointer: f64, buttons: f64,
        clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>
```

`pointer` is the event's `pointerId`, `buttons` its bitmask, `clicks` its click count (2 is a double-click), `hit` the `id` of the topmost op of this part under `at` (`''` when there is none), and `meta` is ⌘ on a Mac and Ctrl elsewhere. A hover is a `move` with `buttons` 0, and `leave` ends it. An input whose seam is not this one is U016, and its message prints the seam to copy. U014 is widened: a `pointer` on a stage with no Draw output is U014.

- **The pointer is not a page output.** It goes to a part, not through `page.out`, because its `at` is in one part's frame, and the frame graph knows a frame only as `<part>.<frame>`. A page-wide pointer control would need a frame the page does not have. kit/run gets a new input kind, `{ kind: "pointer", T, part: "<part>", value }`, delivered to the part's pointer input (the composed record names it: below). A part with none is refused when it is logged (**N013**), and a value that does not fit is **N012** (widened from `in`).
- **Mapping.** kit/page takes a canvas point and undoes the host's zoom and pan (requirement 10), then the page's translation by the extent's corner. That gives a point in the shown frame. For a shown layer, the point is in the bottom producer's frame, and each input's planned `draw` conversion is inverted (`invertEdge`) to reach that input's part's frame.
- **Routing.** The pointer goes to the topmost hit op whose part takes pointer events. If that part takes none, it goes to the next hit down. If nothing is hit, it goes to the bottom part, if that part takes them. **Capture:** from a `down` to its `up` or `cancel`, every record goes to the part that got the `down`.
- **Coalescing.** In the pointer queue, a run of `move` records with nothing else between them coalesces to its last. Down, up, cancel, wheel and leave are delta records and carry over (requirement 3). `perFrame` is 8.

### 6. Picking as a query

**Settled for 2-D, built now.** Every draw op may carry `id?: str`, which a builder sets, which survives `convertOp`, wires and layers, and which J020 refuses when it is not a string. `hitTest(list, point, images)` (kit/draw) returns the topmost op under the point. It is exact per kind: a rect's box (a negative size spans backwards), an ellipse's equation, a line's distance to its points within `width / 2` (and the inside, when it is closed and filled), and the boxes of image, tiles and text. kit/run's `pageView` adds `parts`, the producing part of each op (an array beside `list`), so the page names the hit op's part, its output and its `id`.

**In 3-D the ray is the Dialect's, by design.** The kit delivers `at` in the image's frame. A 3-D Dialect turns it into a ray and asks its own scene Kernel, in its runtime,. No 3-D Dialect exists, so nothing more is built.

### 7. Grips (the new term for stage handles)

**The term.** The glossary's **Handle** is `part.out.<port>`, and it stays. A draggable stage object is a **Grip**. The word is short, means "where you take hold", and collides with nothing in the kit.

**Settled.** A UI declares Grips. Each is drawn by the host in a layer above the stage canvas, never in the Draw list, so a renderer profile never counts or refuses one. Each is bound to one target:

```js
grips: {
  <grip>: {
    each: "<state list path>",                     // one Grip per item (a list with a max); leave it out for one Grip
    at: (<item>, s, $) => [<x>, <y>],              // where it sits, in the stage Draw output's frame: the Dialect computes it from state
    to: (<item>, s, $) => <target>,                // "param.<name>" or "arg.<address>" (below), a str
    kind: "translate" | "length" | "rotate" | "scale",
    axis: (<item>, s, $) => [<dx>, <dy>],          // length: where one unit of the value moves the Grip
    center: (<item>, s, $) => [<x>, <y>],          // rotate and scale
    unit: "deg" | "rad",                           // rotate
    step: <n>,                                     // optional: the value rounds to it
    label: "<label>",
  },
},
```

- **A drag's value**, from the value at the down (v₀) and the pointer's path from `p₀` to `p` in the frame:
  - **translate:** v₀ + (p − p₀), for a target holding two numbers;
  - **length:** v₀ + dot(p − p₀, a) / dot(a, a), where `a` is `axis`;
  - **rotate:** v₀ + the signed angle from p₀ − c to p − c, where `c` is `center`;
  - **scale:** v₀ × |p − c| / |p₀ − c|.
- **Constraints** come from the target's own declaration: an argument's number shape in the Grammar (`data("number", { min, max, whole })`), or a param's `min` and `max`. The value is clamped, then rounded when the shape is whole or the Grip has a `step`. Alt suspends the `step`.
- The lambdas are UI lambdas, lowered against the state as a table column's are (`<item>` is the list's item type). `at`, `axis` and `center` give a point, and `to` gives a `str` (L003 otherwise).
- **A Grip has no bound of its own.** Its range is the target's Grammar shape (`data("number", { min: <n>, max: <n> })`) or the param's `min` and `max`, so a range is stated once, in the Dialect's Grammar, and the preview and the commit both honor it. A UI-only range narrower than the Grammar's is not offered.
- **`each` names a list with a max.** A state list is always `list<T, <max>>`, so "a list with a max" is any state list; U018 refuses an `each` that names something else.
- **`to` gives the whole target.** The text starts `param.` or `arg.`; a state item that stores an address stores it without the prefix (the glossary's Argument address has none), and the lambda adds `"arg." + <address>`.
- **A Grip needs a Draw stage and no pointer input.** The host drags it; `stage.pointer` is for the Dialect's own pointer events.
- **U018** refuses a malformed Grip: a UI with no Draw stage, an `each` that is not a state list with a max, an unknown `kind`, `axis` missing for `length`, `center` missing for `rotate` or `scale`, or an unknown key.
- A Grip whose target cannot be written (requirement 8) is still drawn, as disabled, and the page lists its reason as **H011** (a warning).

### 8. Write-back with two targets

**Settled.** A **target** is one string: `param.<name>`, or `arg.<address>`. An **Argument address** names one argument of one builder call. It is the Ref id kit/define already gives a call's lambdas (kit/define, "Ref ids": `<instance>.<slot>`, `#<n>` unless the slot is `once`, `~2` for a repeated instance name), then `:<i>` (the argument, from 0), then a path into it, `.<key>` or `[<i>]`:

```
arg.<instance>.<slot>#<n>:<i>.<key>[<i>]
```

**A drag previews through the log, and its release commits to source:**
- **param:** each frame of a drag logs at most one `param` input, as an edit does today. The release writes the value into the param declaration's `value` literal. A param's value is not in the content key, so the rebuild that follows changes no revision.
- **arg:** each frame of a drag builds the part once with the address overridden and logs it as a `rebuild` input. The override is a new build option, `run(fn, { values, args: { "<address>": <value> } })`, applied by the builder at that call before its checks, so the Grammar's bounds still refuse a bad value (B004). An address that no call reaches is a TypeError, the host's mistake, as an undeclared param's value is. The release writes the literal into the Program's text. The host builds the edited text, and its record is the last preview's, so its content key is the same and the part does not restart again. "Rough first, then refined" needs nothing from the kit: a progressive renderer restarts on each preview rebuild and refines after the release.
- **One undo step per release.** The host keeps the text's history (kit/page's `createHistory`): a release or an applied edit is one step, an undo builds the previous text and logs its rebuild, and a new edit after an undo drops the redo. An undo is an edit, not a rewind.

**Finding the span** (kit/page's `writeback.js`):
1. kit/define keeps each call's place (`LOCS`, by record: `file` and `loc`, the method name's line and column from the stack, which `site.js` reads). `siteOf(record, target)` returns it, with the argument's Grammar shape.
2. The host parses the file's text with kit/parse's `parseModule` (the vendored acorn; every node has `start` and `end` offsets).
3. It finds the `CallExpression` whose callee is a `MemberExpression` with that property at that line and column, takes `arguments[<i>]`, and walks the path through `ObjectExpression` properties (an identifier or string key) and `ArrayExpression` elements.
4. It reads the node it reaches:

| Node | What a release does |
|---|---|
| a number, string or boolean literal, or `-` before a number literal | replaces its `start..end` with the new literal: a number printed shortest round-trip (to the `step` when there is one), a string quoted as the original was |
| an array literal whose elements are all number literals, or arrays of them (a point list) | replaces its `start..end` with the new list, printed on one line as `[[<x>, <y>], …]`, each number as above; the new value must be a list of the same depth. |
| `$.<name>` (a read of a param of the Program's export) | retargets the Grip or Control to `param.<name>`, and goes on as a param |
| anything else: a name (a `const` included), arithmetic, a call, a template, a spread | **refused.** The Grip is drawn disabled, H011 names the expression's text, and the fix reads "write the literal at the call, or declare a param and pass `$.<name>`" |
| one span reached by several calls (a call in a loop, or a helper called twice) | **refused**, H011: "this call runs <n> times, so its argument is not one value" |

**A computed argument refuses its Grip, and its `const` is not edited.** Editing the `const` would move every other use of it, and the preview would not match the commit, since an override changes one call and the `const` changes all of them. The rule is simple to state and to check, and its fix is one edit by the author.

- A release whose span no longer holds the text the record was built from (the person edited the text in between), or whose edited text no longer builds, is **H012** (an error). The edit is not kept, and the text is unchanged.
- **In a glue.** A glue's parts' calls are in the glue file, and their spans are found the same way. A preview calls the glue again with the override (`callGlue(exported, path, { args })`) and logs a `rebuild` for the part. After a commit, every part whose content key changed is rebuilt. An edit that changes the composition's parts or wires reloads it as a new run, and says so.
- **The editor stage** (requirement 9) shows the Program's text, editable. Write-back lands in it, Apply builds it, and both make one undo step.

- **Every call needs a Ref id.** kit/define's README defines Ref ids by the instance's tag and slot (`<tag>.<slot>#<n>`), written there for the lambdas under a call, and the build must confirm that a call with no lambda has the same id and a LOCS entry; if it does not, `record.js` records one for every call (a build task, and a test: 49a below). The legs took the task's word for it.

### 9. Layout

**Settled, all built now.**
- **A tile, whole.**
  ```js
  tiles: { <tile>: { title: "<title>", place: { <direction>: "<view or tile>" }, body: [<component>, …] } }
  ```
  `place` takes one direction, from `splitRight`, `splitLeft`, `splitAbove`, `splitBelow` and `tabWith`, naming a **view** (the generated views, `stage`, `controls` and `editor` among them) or another tile. `body` is a list of components: `{ kind: "control" | "param" | "action" | "view" | "row", … }`, where a `row` holds `items: [<component>, …]` laid out side by side. The stage is the generated view `stage`: `tabWith: "stage"` tabs a tile with it.
- **The generated `controls` view** shows the page's Controls in declaration order, each as its own group, in a row that wraps. A Control's `grid` lays out only its own buttons, so a pad and two buttons that sit apart on screen are two Controls, and a tile's `row` puts them side by side.
- **Tabs:** `place: { tabWith: "<view or tile>" }` (declared today, never laid out) makes a tab group.
- **Splits:** the existing split directions are laid out as a tree. A pure function in the host, `layoutOf(uis, views)`, returns the tree and is tested without a DOM.
- **The editor stage:** the generated view `editor` (already in `VIEWS`) is the Program's text in a textarea over a `<pre>`. Syntax highlighting is later: it needs a lexer the playground will bring.
- **More than one view, and a picture inside a tile:** a new component, `{ kind: "view", draw: "<Draw output>", pointer?: "<input>" }`, draws another Draw output of the same part in its own canvas. A chart can be a Draw output in a tab. U014 is widened to refuse a `view` that names no Draw output.
- **Controls inside a tile** (a plugin-style panel): `{ kind: "control", control: "<control>" }` and `{ kind: "param", param: "<name>" }` place a Control's or a param's on-screen form, and `{ kind: "action", action: "<action>" }` an action's button (**U020** when the name is not declared; a param's is checked at `lower`, per Program).
- The generated view `pad` becomes **`controls`**, the page's Controls. A `place` naming `pad` is U003, with a did-you-mean.

### 10. Mode and navigation

**Settled.**
- **Double-click** is a pointer `down` with `clicks: 2`. What it opens (an editor) is view state the Dialect keeps in its run state, where its Draw output and its Grips read it. View state is small, and being in the state means a replay shows the same.
- **Zoom and pan** are the host's stage transform, which is not logged and does not change the run, as a window size does not. Ctrl or ⌘ with the wheel, or a pinch, zooms; Space with a drag, or a two-finger drag, pans; Fit resets. kit/page applies it in `draw()` (`setTransform`) and undoes it in pointer mapping. A plain wheel goes to the part's pointer input.
- **Page navigation**  is a Control (`number` or `choice`) or the wheel, which the Dialect reads into its state.

### 11. Actions

**Settled.** A UI declares actions:

```js
actions: { <action>: { label: "<label>", module: "./<file>.js", export: "<name>", gives: "file" | "edits" } },
```

kit/page's `runAction` imports nothing itself: the host imports the module, as it does a custom element's, and passes the function. It is called with `{ record, state, params, files, signal, progress, pause }`. `files` holds the package's decoded data files (kit/package's `data`). `progress(<fraction>)` reports, and `await pause()` gives the thread back as a sweep's slices do (12 ms budget). The call is cancellable through `signal`. What it returns:
- **`gives: "file"`:** `{ name, type, bytes }`, with `bytes` a `Uint8Array`, which the host offers as a download.
- **`gives: "edits"`:** `[{ to: <target>, value }]`, applied as one write-back and one undo step. 

A throw, or a result of the wrong shape, is **H013**. **U019** refuses a malformed action: a module path not of the form `./<file>.js`, an export that is not an identifier, an unknown `gives`, or, given `moduleText`, a module whose text has no export of that name. The manifest's `elements` becomes **`modules`**, every trusted module the UI names (its elements' and its actions'), and K015 and K016 are widened to match. Workers are later: an action that cannot yield every 12 ms holds the page, as it would today.

### 12. Latency class

**Split: the declaration and device-time stamps now, the direct path later.** A Control may declare `latency: "direct"` (U017 for any other value). It means the input should bypass the frame loop and go straight to a part running at its own rate. The composed page records it. Its stamps are device time, as every Control's are (requirement 4), so a note's `$T` is when it was struck. Going straight to a part running at its own rate is that runner's job, and no such runner exists yet. Until it exists, such a Control travels the frame path like any other, and such a Control can be used, with frame latency, before it does.

### 13. One gesture unlocks everything

**Settled.** In this draft, "unlock" means one click that gives focus and permissions; "locked" means the page is waiting for that click. When a composition has a Control with keys, MIDI, a gamepad or `latency: "direct"`, the page is created **locked**. The run is paused at T = 0, `page.key` returns false, and the host shows "Click to start" over the stage. One gesture (a click, a tap, or the first pointer down on the stage, which is also delivered) calls `page.unlock()` and does every step in this list:
- focuses the stage element (it has `tabindex`);
- calls every unlock hook the host registered: `AudioContext.resume()` once such a runner exists, and `navigator.requestMIDIAccess()` when a Control declares `midi` (refused or absent: **H014**, a warning, and the other adapters still work);
- starts the run.

A gamepad exposes itself only after one of its own buttons is pressed (a browser rule), so that press is its gesture. On **blur**, the host sends the release of every held state Control (buttons false), an off for every held trigger, and a `cancel` for a captured pointer, so nothing sticks down. It then shows "Click to resume", and the run goes on. This replaces "releasing held keys on blur" in kit/page's "Not here".

## What a host must do in a Claude artifact

- **Treat the frame as unfocused until a click.** Programmatic `focus()` before any interaction fails (M0's probe, `input.focusApi`), so the lock overlay of requirement 13 is required, not optional.
- **Spend that one gesture on everything:** focus, `AudioContext.resume()` and the MIDI request together, in the click's handler, since each needs a user activation that expires.
- **Expect MIDI to be absent.** Safari has none, and in Chromium the iframe needs `allow="midi"`, which claude.ai's allow list may not grant (unknown: a feasibility probe). H014 says so, and keys and the on-screen keyboard still play.
- **Fetch nothing from another host.** A `pick` reads its bundled data file (kit/package's `data`), never a live catalog.
- **Download through a blob URL** on an `<a download>`. Whether a binary download works in an artifact is a feasibility probe ("a binary `save()`"). Until it passes, an action's file is not known to arrive.
- **Use no storage the run depends on.** The key map override and the zoom are per-viewer conveniences (try/catch `localStorage`), and everything the run reads is in its log.

## The kinds

| `kind` | Keys (beyond `kind`, `label?`, `note?`, `perFrame?`, `latency?`, `each?`, `to?`) | Record (the seam it makes) | Class | `perFrame` |
|---|---|---|---|---|
| `buttons` | `buttons: ["<button>", …]` (1 to 16 identifiers), `grid?`, `keys?`, `gamepad?` | `Event<{ <button>: bool, … }>`: every button, true while held | state | 2 |
| `toggle` | `value: <bool>`, `keys?` | `Event<{ value: bool }>` | state | 1 |
| `number` | `min`, `max`, `value`, `step?`, `curve?`, `look?`, `keys?`, `gamepad?`, `midi?` | `Event<{ value: f64 }>` | state | 1 |
| `vector` | `dims: 2 \| 3`, `min`, `max`, `value: [<n>, …]` | `Event<{ value: vec2 }>` or `vec3` | state | 1 |
| `color` | `value: [<r>, <g>, <b>]` (0 to 1) | `Event<{ value: vec3 }>` | state | 1 |
| `choice` | `options: ["<option>", …]`, `value`, `look?: "menu" \| "tabs" \| "radio"`, `keys?` | `Event<{ value: '<option>' \| … }>` | state | 1 |
| `text` | `value?` (default `""`), `max?` (characters, default 256), `lines?` (default 1) | `Event<{ value: str }>` | state | 1 |
| `pick` | `file`, `key`, `show?`, `map?`, `carry?`, `value` | `Event<{ value: str, <column>: f64 \| str, … }>` | state | 1 |
| `points` | `max`, `x`, `y`, `value: [[<x>, <y>], …]`, `look?: "curve" \| "list"` | `Event<{ value: list<vec2, <max>> }>` | state | 1 |
| `triggers` | `count`, `first?` (default 0), `keys?`, `midi?` | `Event<{ index: f64, on: bool, velocity: f64 }>` | delta | 32 |

A keyed Control (`each`) adds `key: str` to its record. `to` makes the Control commit on release, as a Grip does. A Control whose name is not an Event input must have `to`: it is then **part-local**, shown with its part and never a page output, and its preview goes through its target (a param input, or an arg rebuild). A pick that edits the source is one. **U017** refuses a malformed declaration: an unknown kind (did-you-mean) or key, a missing key, `min` not below `max`, a `value` outside the range or not among `options`, `curve: "log"` with `min` at or below 0, buttons that are not identifiers or repeat, a `grid` naming an unknown button or one twice, a code that is not a `KeyboardEvent.code` (`/^[A-Z][A-Za-z0-9]+$/`), more `keys` than `count`, a MIDI number outside 0..127, a `perFrame` that is not a whole number of at least 1, an `each` that is not a function, an unknown `latency`.

## In a composition

- **The page's outputs are the composed parts' Controls.** kit/compose reads each part's UI from `options.packages` (kit/package's `loadPackage` gives `ui`), matched by Dialect. `page.out.<anything>` is an open handle at glue time, judged at `check`: a name no part's UI declares is S111, listing the Controls and, when the packages carry no UI, saying to pass loaded packages. A page wire is then compared as any wire (S2xx), so a glue that wires a Control into the wrong input is told so.
- **One name, one Control.** When two parts' UIs declare one name with equal declarations (canonical JSON, with no `each` and no `to`), it is one Control, which the glue may wire to both. Any other pair is **S119** (an error) naming both parts and both declarations. The person has one keyboard, so two different Controls under one name would confuse them as well as the kit.
- **S120** (a warning): a part's UI declares a Control whose input the glue leaves unwired by anything. Wiring that input from another part silences it.
- **The composed record.** The page's entry gains `controls: { <control>: { kind, seam, records, perFrame, latency?, keyed?, decl } }`, which kit/run checks page inputs against (N012, N013) and the host builds its on-screen forms and key maps from. Each part's entry gains `pointer: { <Draw output>: "<input>" }` from its UI's stage and view tiles.
- **A part run alone.** `examplePreset(name, fn, build, { ui, wirePage })` (`ui` is what `defineUI` returned; `wirePage` is today's option, true unless `false`, which wires nothing and is how a test runs) wires `page.out.<control>` to `<part>.in.<control>` for every Control in `ui` that has an input, by name. With no `ui`, nothing is wired. Part-local Controls and Grips need no wire.
- `PAGE_CONTROLS`, `PAGE_CHANGES_PER_FRAME`, `pageInputProblem` and the `pageRuntime` constant retire. In their place, `pageRuntimeFor(controls)` sizes the page from each Control's `perFrame`.
- **A custom element stage** speaks the same targets as the host's own widgets. It may dispatch `wb-control` (`{ control, value }`), `wb-param` (`{ param, value, phase: "preview" \| "commit" }`) and `wb-edit` (`{ to, value, phase }`). The host checks each one against the declarations, and logs it or refuses it with the kit's own code (N012, N013, H011). `emits`, its event list (`pick`, `select`, `param`) and U009 retire: no host ever listened for them.

## Codes

| Code | Module | When |
|---|---|---|
| U015 | define | a Control (or a `pointer`) names no Event input of the Dialect and has no `to` (did-you-mean; "an Event input" when it names a value input) |
| U016 | define | a Control's record, or the pointer seam, does not fit its input's seam (both seams printed; the pointer's to copy) |
| U017 | define | a malformed Control declaration (the kind table's list); at `lower`, an `each` that does not return a list of instances, a repeated key, or an instance whose keys misfit its kind |
| U018 | define | a malformed Grip (requirement 7) |
| U019 | define | a malformed action (requirement 11) |
| U020 | define | a `control`, `param` or `action` component naming nothing declared (a param's at `lower`) |
| U014 | define | widened: a `view` naming no Draw output, a `pointer` on a stage with no Draw output |
| U001 | define | widened: `inputs` and `emits` are unknown keys, whose tips say to write `controls` and to dispatch `wb-control` |
| S119 | compose | two parts' UIs declare one Control name differently (or either has `each` or `to`) |
| S121 | compose | a warning: two different Controls bind one key code |
| S120 | compose | a warning: a part's UI declares a Control whose input nothing wires |
| S111 | compose | widened: a page Control no part's UI declares, or no UI given |
| N012 | run | widened: a `control` or `pointer` input whose value does not fit its seam (until now a plain Error for a page input) |
| N013 | run | a `control` input naming a Control the composed page lacks, or a `pointer` input to a part with no pointer input: refused when logged |
| N001 | run | widened: a delta page wire carried records over |
| H011 | page | a warning: a Grip or Control whose target cannot be written (an address no call reaches, a computed argument, one span reached by several calls); it is drawn disabled |
| H012 | page | a write-back that cannot apply: the text changed since the record was built, or the edited text does not build (with its B codes); nothing is kept |
| H013 | page | an action threw or returned the wrong shape |
| H014 | page | a warning: a device adapter is absent or refused (MIDI, gamepad) |
| K015, K016 | package | widened to the manifest's `modules` (elements' and actions' modules) |

Retired, numbers not reused: **U009** (`emits`), **U010** (`inputs`), **H009** (a seam that fit several ways). Each module's `codes.js` was checked on 2026-11-27: the last numbers in use are U014, S404 (S118 in the 1xx block), N012, H010, J044, K021, B017 and D034.

## Glossary additions

- **Control:** a named source of records a person makes, declared in a package's UI with a kind from the kit's closed list, and bound by its name to the Dialect's Event input of that name (or, with `to`, to a param or an argument). In a composition, a Control with an input is `page.out.<control>`.
- **Grip:** a draggable object on the stage, declared in a package's UI, placed by the Dialect from state, and bound to one target. It is not a Handle, which names a port.
- **Target:** `param.<name>` or `arg.<address>`, what a Grip, a Control with `to`, a custom element's `wb-edit` or an action's edit changes.
- **Argument address:** one argument of one builder call: the call's Ref id, `:<i>`, and a path.
- **Write-back:** a release, an action's edits or an applied edit, written into the Program's text as literals, one undo step each.

## Wiring a page Control, for reference

A glue program composes parts and wires outputs to inputs. This is the shape of its calls, as the compose documentation has it today:

```js
export default ($) => {
  // ... parts built from their packages: <part> ...
  return compose("<name>")
    .part(<part>)
    .wire(page.out.<control>, <part>.in.<input>)
    .show(<part>.out.<output>, <part>.out.<output>);
};
```

`.show` takes one output or several, which are layered. A part run alone is made by the host's preset helper: `examplePreset(name, fn, build, { ui, wirePage })`.
