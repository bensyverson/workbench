# Findings: Ben's workbench sketches against the kit

*2026-11-27, container `tXS4wB`. Inputs: [Ben's sketches](2026-11-27-workbench-sketches.md). Four read-only Opus agents, one per cluster: optics (`B7flF7`, feas-optics-47), audio (`K4CaKm`, feas-audio-48), type and layout (`2j5ARa`, feas-type-49), and the language playground with the Bench-library question (`kuwxBq`, feas-lang-50). Constraint (Ben, 2026-11-27): no new dependencies. Browser standards (WebGPU, WebGL2, Web Audio, AudioWorklet, Web MIDI, WebAssembly, FontFace, Canvas, Workers) are not dependencies. The probes behind the figures are in [scripts/feasibility](../scripts/feasibility/README.md); each figure names its command, and a rerun varies with the machine and its load (the integrator's rerun gave 119.5 ms for the 512² hash, against the agent's 122 ms). VERIFIED means a doc, a file:line, a probe or a cited URL; everything else is the agent's inference.*

## The answer in one paragraph

Nothing in the eight sketches is impossible as a whole. The impossible parts are narrow and listed below, each with its reason. But the kit as built serves games and shaders: every sketch needs pieces it does not have, and they cluster into seven gaps. The largest and most shared is **interaction**. All eight sketches need input that is not a held button: pointer input on the stage, handles bound to builder arguments, **write-back to source** (ruled in M4 and never built), text entry, notes, knobs and controls a Program declares. So the declared-controls stage (`1ymuQu`) is the foundation for all of them, and it is larger than one stage. The second finding is about where code runs. Bench (the Runtime Subset) cannot grow a list, write into one, index a string or recurse. So every heavy algorithm in these sketches (parsing, line breaking, pagination, overlap removal, font writing, voice allocation, optimizers) belongs in a package's **runtime**, which is trusted JS, and not in Kernels. The third is that kit/run's per-step contract (state checked, frozen, run twice in dev and hashed at every instant) was sized for game states. An image or audio stream cannot be run state: it must be **derived output** beside the state, as a Draw list already is.

## The seven gaps, ranked by how many sketches need them

| # | Gap | Sketches | Size | Status |
|---|---|---|---|---|
| 1 | **Interaction**: declared, named controls of many kinds; pointer input on the stage mapped through inverse frame edges, with hit tests; handles bound to builder arguments; source write-back plus an editor; text input; layout (tabs, splits, more than one view) | all 8 | M–L (several stages) | `1ymuQu` is its first stage |
| 2 | **Heavy algorithms in runtime JS**: a ruling that they live there (M4 decision §1 already allows exporters and solvers), plus data files delivered to the runtime (they are loaded but never reach it: `kit/run/part.js:128`, `kit/page/sources.js:27`, VERIFIED) | Grotesk, Book, playground, lens optimizer, synth | S for the plumbing; the algorithms are package work | needs a ruling |
| 3 | **Derived outputs beside state**: an image or audio buffer cannot be state. Hashing a 512×512×3 buffer takes 122 ms, and `checkState` refuses a `Float32Array` (`node scripts/feasibility/B7flF7-state-probe.mjs`, `node scripts/feasibility/B7flF7-hash-probe.mjs`). Per-sample audio instants grow memory about 17 MB/s with no bound (`node scripts/feasibility/K4CaKm-growth.bench.js`). Per-block audio (128 frames) runs at 0.13× real time on kit/run's contract (`node scripts/feasibility/K4CaKm-rate.bench.js`), so the contract works when steps are blocks | path tracer, camera, synth, sequencer | M | needs a ruling |
| 4 | **New sinks and backends**: a GPU image pipeline (a WGSL emitter from the LIR, float targets with ping-pong accumulation, several passes, kernel shapes beyond uv → color, an Image stage and seam, a statistical cross-target comparison); an audio runner in an AudioWorklet with the audio clock as master and its own overload policy; a "package offers a file" export contract | path tracer, camera, lens charts; synth, sequencer; Grotesk | L, L, S–M | backlog |
| 5 | **Draw's vocabulary past DMG**: a `path` op with curves, several contours and a fill rule; real fonts, and text that scales; stage units and zoom (today it is one unit per pixel); more than one shown output; an x/y series chart (today `plot` is a time history) | Grotesk, Book, lens bench, synth UI | S–M each | backlog |
| 6 | **Time past the game loop**: runs made only of demand parts, with no instant maker (`kit/run/README.md:118`, not built), for timeless workbenches; an audio master clock; overload that sheds load instead of slowing time | Grotesk, Book, playground; synth | S; L (with gap 4) | backlog |
| 7 | **Data across packages**: a scene, a font or a lens as a data seam (Kernels never cross a seam), and a shared-library mechanism, since packages may not import each other (`kit/API.md:302`, "Dialect imports", not built) | camera, Book + Grotesk, sequencer + synth | M–L | needs a ruling |

## Per sketch, in brief

**Spectral path tracer.** Path-tracing Kernels fit Bench: bounded bounces, no recursion, hero-wavelength sampling, an analytic CIE 1931 fit, Sellmeier dispersion and tone maps as Library entries (S each). The CPU path works but is slow, about 0.3–1 s per sample at 512² per thread (inferred from M0's 10⁷ xorshift iterations in 65 ms). The GPU path needs gap 4. Procedural or SDF objects work only if objects are *data* (a closed set of primitive kinds the renderer reads in a loop), because the emitter takes one Kernel and nothing builds a scene Kernel from a record. A lathe of a bezier profile has an SDF (S–M); a sweep has none that is exact. Lenses should be analytic surfaces, not raymarched, because f32 march error shows up as aberration. Progressive refinement and restart on edit fit once the image is derived (gap 3). The denoiser is an edge-avoiding à-trous filter (Dammertz 2010), M on the GPU pipeline. HDR output uses a WebGPU canvas with `rgba16float`: Chrome 129 ships it, and Safari accepts it but does not display it ([Chrome](https://developer.chrome.com/blog/new-in-webgpu-129), [WebKit 272702](https://bugs.webkit.org/show_bug.cgi?id=272702)), so there is an SDR fallback. 3-D handles: picking is the scene Kernel's own JS emission run for one ray, and the gizmo is a Draw layer over the image (gap 1).

**Lens Bench.** Most of it fits today. A Grammar of elements, a sequential trace on a demand clock (S), and the cross-section as Draw polylines (S). The glass catalog bundles refractiveindex.info's **CC0** database, converted offline from YAML by a script (S; [source](https://github.com/polyanskiy/refractiveindex.info-database)). MTF, ray fans and spot diagrams need an x/y chart (gap 5) and a 64² FFT of the pupil (S–M). The optimizer is damped least squares (Levenberg–Marquardt) with finite-difference Jacobians, ranked objectives as weights or lexicographic order, and glass choice as a nearest-neighbor search on the nd/Vd map: about 200–400 lines of runtime JS in a sliced, cancellable runner like `sweepRuns` (M). "Generate new designs" with a different element count means writing a new Program, so it needs a printer from record to source plus the editor.

**Virtual Camera.** A lens crosses a seam today (`list<{ radius: f64@mm, … }, 32>`). A scene crosses only as data (gap 7). The camera renders Kolb-style, tracing from the film back through analytic surfaces into the scene inside one part. Rays passed as Events between parts would copy, stamp and queue millions of records a frame, which is unwise. "Entering the lens module" means opening one part as its own workbench and returning it as a rebuild; kit/run supports the rebuild, and the host needs focus, an editor and write-back.

**FM synth.** The Dialect is ordinary package work (M): phase accumulators, an algorithm as a DAG of operators declared in the Grammar, exponential ADSR, voices as a state list with a declared max and oldest-voice stealing. The missing piece is the audio runner (gaps 3, 4 and 6): a block clock in the worklet, with notes posted straight to it (latency about one 2.7 ms quantum plus `outputLatency`). A synth on the main thread would need 50–100 ms of lookahead, which is unwise for live playing. Exact replay across browsers needs `sin` written in Bench, since `Math.sin` is not required to round the same everywhere. The plugin UI's drawing works today (an ellipse and a needle); dragging needs gap 1, and 36 flat param names need structured, per-construct live params.

**Sequencer studio.** Shapes and physics are package work: semi-implicit Euler with circle contacts is 300–500 lines (M), and rigid polygons are L. Physics triggers notes as an Event seam (S). DSL-defined stage UI meets the parked "Program-level UI" backlog entry's un-park trigger. Composition with the synth is glue wiring, not a Program-level import, so patches travel as a field on the note record. Audio between parts needs an `Audio<channels>@<rate>` seam that lives only in the worklet, plus a mixer part like `layer`.

**Grotesk.** Glyph construction from components is a Grammar (S) with geometry from first principles: cubic arcs, a superellipse fitted to cubics, join angles, ink-trap notches, offsetting (M, 600–1,000 lines). Variants are build-time choices; they can never be variable axes, which matches how fonts work. The interpolation-compatibility check is S. Export, from first principles, uses Uint8Array and DataView: `.glyphs` (S, an OpenStep plist), UFO as a store-only zip (S–M, about 150 lines including CRC32), a static TTF (M, 1,000–1,500 lines, cubic to quadratic) and a variable TTF (M+, fvar and gvar). The Glyphs-like UI needs gap 1 throughout: type a word, double-click to open a glyph, and handles placed where the Dialect computes them that write the literal back. Counters cannot be see-through until Draw has a `path` op with a fill rule (gap 5).

**Book.** A page-layout Grammar (S–M), plus runtime-JS algorithms written from first principles: a Markdown subset (500–800 lines), Knuth–Plass line breaking (about 400), Liang hyphenation (about 100, with pattern data as a data file, license to check), and a page builder with keeps, footnote re-flow, floats and sidebars (M–L). Pagination is a pure function of the record, the text and the font, so it is init and step on a demand part. **Font metrics must be data**: the host's `measureText` varies by machine and would break replay. Text renders as glyph outlines through the `path` op, so no FontFace or DOM enters kit/page. The font crosses from Grotesk as a seam of glyph records with metrics and kerning (S–M). Placing another package's diagram needs a transform or group op in Draw, which the draw-list draft parked.

**Language playground.** Bench cannot parse a user's text. A probe found that `s[0]` on a string is L009; `s.length` and `s.charCodeAt` are L002; growing a list is L003; and storing into an item is L012 (`node scripts/feasibility/kuwxBq-probe.js`). So the playground's parser is host code generated from the Grammar's data: a packrat PEG interpreter or LL(1) with conflict reports (M, 300–500 lines), with errors reported at the farthest point the parse reached (S). The AST is host data. Translation should target the kit's own core IR, so kit/interp is the oracle and emit/js runs it (M). The wasm encoder is about 300–500 lines from the binary spec (M; it is already M6 on the roadmap), and M0 verified that wasm instantiates in an artifact. Highlighting is a host lexer sending spans to an editor stage made of a transparent textarea over a `<pre>` (S–M). The design should be written as builder text, the kit's premise; a graph view can be derived from the record later.

## The General question: what a Bench library is, and QuickJS

**Builder methods call no library.** They record calls into a record (`kit/API.md:131-140`). Functionality lives in four tiers:
- **Build-time JS:** Grammar checks, conventions and `environment`.
- **Intrinsics:** typed signatures, a JS `ref` and a spelling per target. Fields has 115 lines of them.
- **Library entries:** Bench source, lowered only when a Program reaches them. Fields' whole Library is 41 lines: `pmod`, `vnoise` and `fbm`. Lowering fields' domain-warp Program that calls them takes 6.34 ms (`node scripts/feasibility/kuwxBq-time-lower.js`, the mean of 20 runs).
- **Runtimes:** trusted JS over the state.

A large library costs nothing until it is called. Its real gap is generics: a parameter takes one type across all calls (L014).

**QuickJS is rejected.** It is impossible as a route to the GPU and unwise for any target. Its bytecode is untyped and stack-based, emitted in one pass with no AST, and memory is managed at run time. The format is tied to one engine version, and the bytecode has nowhere to hold spans or list maxes ([QuickJS docs](https://bellard.org/quickjs/quickjs.html) §3.4.5, §4.1, §4.3.5). The kit's subset refuses recursion, closures and unbounded loops because GPU targets and wasm without a collector cannot host them, not because parsing is hard. QuickJS gives only a front end, which the kit already owns, and it would be a dependency.

**Recommendation: stay in Bench and grow it.**
- (a) Library entries as real `lib/*.js` files, not strings (S).
- (b) Generics by specialization: lower once per distinct call signature instead of L014 (S–M).
- (c) Agents port existing GLSL noise, SDF and color code, each checked by the harness against its `ref` (S per port; check each license).
- (d) Subset growth as needs arrive: fixed-size mutable local arrays, struct returns (M each, since each touches the IR, interp, both emitters and the LIR).

## Impossible or unwise, with why

| Item | Verdict | Why |
|---|---|---|
| A point-light caustic through a prism by unidirectional path tracing | impossible | It has zero probability: no camera path can hit a point light through glass. It needs light tracing with splatting, bidirectional path tracing or photon mapping, so it needs atomics (WebGPU) or the CPU |
| Bit-exact or hashed GPU render output | impossible | GPUs round per op and differ by vendor. Only converged statistics compare |
| An image or audio buffer as part state | unwise | 122 ms hash per commit at 512², typed arrays refused, unbounded memory per-sample (gap 3) |
| WGSL or SAGA as the authoring language | unwise | It would lose the reference interpreter, the bit-exact CPU twin and the debugger. SAGA is Swift and a dependency. WGSL fits as an *emit target* |
| Rays or radiance as Event traffic between parts | unwise | Every record is copied, stamped, frozen and queued |
| Full wave-optics diffraction in a scene | unwise (XL research) | Diffraction BSDFs and aperture FFTs give the visible effects |
| A live glass-catalog fetch from inside a Claude artifact | impossible today | The artifact blocks other hosts (proposal L18, delivery decisions). Bundle the CC0 data; refresh by chat-Claude republishing it, a connector, or the desktop app's browser |
| An ML denoiser | unwise | Weights plus a runtime are a dependency. Use à-trous |
| Manufacturer glass catalogs redistributed | likely unwise | Licensing. refractiveindex.info is CC0 |
| Per-sample audio instants on kit/run | unwise | Memory grows about 17 MB/s; checks run per instant. Use blocks |
| A live synth on the main thread | unwise | Lookahead must absorb jank, and rAF stops in background tabs |
| Setting the output bit depth | impossible | Web Audio is float32 and the device format is the OS's. A quantizer can emulate it (5 lines of Bench) |
| Different sample rates per part on one AudioContext | impossible without resampling | Refuse it at composition, or resample (M) |
| Web MIDI in Safari or WebKit | impossible today | No implementation ([WebKit 107250](https://bugs.webkit.org/show_bug.cgi?id=107250)). In a Chromium artifact it is unknown: the `midi` policy defaults to `self`, so the iframe needs `allow="midi"`, and claude.ai's allow list is not public. Probe it |
| A SharedArrayBuffer ring buffer between threads in an artifact | impossible | The artifact is not cross-origin isolated (M0). Use `postMessage` |
| A native VST | out of scope | A VST-*style* UI only |
| Overlap removal as a font requirement | unwise | TrueType allows overlapping contours (OVERLAP_SIMPLE), as variable fonts often use, and a boolean engine is a numerical long tail. Ship overlaps |
| Text measured through the host's Canvas or DOM | unwise | It varies by machine and breaks the pure, replayable run. Metrics must be data |
| Font hinting | out of scope | |
| Full CommonMark | unwise | A subset serves "a long Markdown doc" |
| Parsing user text in Bench | impossible today, unwise even if the subset grows | No string access, list stores, growing lists or recursion |
| A graph view as the primary language-design surface | unwise | Builder text is the kit's premise; a graph derives from the record |
| QuickJS bytecode to the kit's IR | impossible for GPU targets, unwise for any target | Above |

## What the controls redesign must cover

This merges all four agents' lists, stated generally. The declared-controls draft (`sSgaWG`) settles which of these are its stage and which are later stages, and says so.

1. **Declared, named controls, bound by name and checked by seam**, declared by a package *or a Program* (the sequencer; the parked Program-level UI entry's trigger is met).
2. **Value kinds beyond buttons**:
   - a slider, number or knob with a range, a curve (log), fine-drag and reset;
   - vec2 and vec3 entry, color, and an enum dropdown;
   - a catalog picker over a data file, such as glasses on an nd/Vd map;
   - text entry;
   - structured values: an envelope's point list, per-construct values such as `op1.ratio`.
3. **Two record kinds.** A *state* record (held directions, a knob value) may be folded or coalesced. A *delta* record (note on and off with velocity, a trigger) is reliable and never folded. Today's page fold assumes every record is the whole held state and is sized for two changes a frame (`PAGE_CHANGES_PER_FRAME`), so a four-note chord in one frame loses notes.
4. **One declared input, many hosts.** Keys, an on-screen control, a gamepad and MIDI all produce one seam; the host picks the adapter, and device-only fields are optional. A device's own timestamp maps to T and is logged.
5. **Pointer input on the stage.** Down, move, up, wheel and hover with `pointerId`, mapped into the shown part's frame through inverse edges. Moves coalesce during a drag; down and up always arrive. It has capture during a drag.
6. **Picking as a query.** In 2-D, a hit test over the shown Draw list (`opBox`) naming the op's part and source. In 3-D, a ray answered by the part's own Kernel.
7. **Handles**: draggable stage objects a package declares, each bound to one param or builder argument, with a kind (translate, rotate, scale, length), constraints from the Grammar's bounds, and a position the Dialect computes from state. **The glossary's Handle (`part.out.<port>`) collides: pick another term.**
8. **Write-back with two targets**: param values into the run log (exists), and literals into the Program's source (not built: argument spans through the vendored acorn, an editor, one undo step per release). A drag previews through the log at rough quality; the release commits to source and refines. A computed argument (not a literal) refuses its handle or edits its const: rule which.
9. **Layout.** Tabs (`tabWith` is declared, never laid out), split views, an editor stage, more than one view, and a picture inside a tile.
10. **Mode and navigation.** Double-click to open an item's editor (a view state the Dialect owns), and page navigation, zoom and pan as a stage transform.
11. **Actions**: "Export TTF", "Run optimizer": a declared action that produces a file or starts a cancellable long job.
12. **Latency class.** A control may declare that it goes straight to an audio-rate part, not through the frame loop.
13. **One gesture unlocks everything.** Artifact focus and a suspended AudioContext both need a click, so one "click to start" covers both.

## Founding-example assumptions found in the kit

These go beyond [the overfit finding](2026-11-27-founding-example-overfit.md):
- **Controls:**
  - `defineUI`'s input roles are `dpad.*`, `a`, `b`, `start` and `select`, and a view is named `"pad"` (`kit/define/ui/validate.js:12,15`).
  - The stage contract's `pick`, `select` and `param` events are validated, but no host listens for them.
- **Draw:**
  - one font, `mono`, in 8-unit glyphs (a Game Boy tile), which never scale (`kit/draw/ops.js:22-24`);
  - 8-bit hex colors;
  - `line` is a polyline only, with no curves or contours;
  - images are PNG only, declared per Dialect with sprite-sheet cells;
  - a stage of one unit per pixel;
  - one shown Draw output.
- **Host and GLSL:**
  - the host shows the stage as a game screen: `image-rendering: pixelated`, a 640 max width, a black bezel (`kit/page/host/host.css:37`);
  - the GLSL kernel shape (uv to RGBA8 color) and its fixed sampler (nearest, clamp, for atlas cells).
- **Time:**
  - real time is the game loop: 60 Hz nominal, a 1/15 s catch-up cap, slow motion on overload;
  - every run assumes time, since a demand-only run is not built.
- **Params and charts:**
  - params are flat scalars per Program, with no vec3, color or list param;
  - `plot` is a time history of one number.

## Doc errors and premises the agents corrected

- **Write-back to source does not exist.** The M4 UI decision promised "param controls with write-back", and several briefs (this session's included) assumed it. Param edits go only to the run log; the Source view is read-only, and the page has no editor. Write-back exists only in the original DMG HTML (`project/2026-11-23-dmg-workbench.html:2305`).
- **Data files are half built:** they are loaded and checked but never delivered to a runtime or a Program.
- **`xs.length` is L002** in a lambda of a Dialect made with `defineDialect`, though kit/lower's README lists a list's length as a loop bound. This is unconfirmed; `node scripts/feasibility/kuwxBq-probe.js` shows it.
- **README.md:5 is stale:** it says M3 is in progress.

## Probes that settle open facts (each S)

| Probe | Settles |
|---|---|
| An AudioWorklet in an artifact: `addModule(blob:)`, `new Function` in the worklet, `resume()` on a gesture, `structuredClone` in the worklet scope, the latency figures | the audio runner's design |
| Web MIDI in a Chromium artifact | whether MIDI is a host option at all inside claude.ai |
| WebGPU in a Chromium artifact (M0 checked WebKit only) | the GPU pipeline's reach |
| A binary `save()` of an artifact download | font and image export |
| `fetch` to another host from an artifact (proposal L18 says it is blocked; M0 did not probe it) | the catalog route |
| `FontFace` from generated bytes under the artifact's CSP | whether a generated font can preview through the browser at all |
