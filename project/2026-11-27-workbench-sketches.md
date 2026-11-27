# Workbench Sketches

From Ben, 2026-11-27
### General

One question I hold: what does a full library in Bench look like? (The code that builder methods call.) And is there any merit in actually writing library code in JS and hijacking something like QuickJS to compile to our IR, or translate from its IR to ours? I’m fine keeping everything in Bench (it seems pretty capable), but I’m just not informed on how we define lots of functionality.

### Spectral path-tracer

#### What:
A physically principled path tracer which operates in spectral light, so it can model dispersion, diffraction, etc. The path tracer should progressively enhance from CPU to GPU using WebGPU if it’s able to. This brings up an interesting computational path on the Bench-side. We may want to standardize on WebGPU since it’s known to the model, and translate it on the backend. For example, see https://github.com/AdaEngine/SAGA.

This renderer should take scenes that are built using the fluent builder DSL. I would think you can define objects or textures and then compose them into scenes. Maybe rather than vertex-based, all the objects should be procedural / mathematical, with a few high-level operations that allow the user to create shapes from bezier profiles or similar. But I’m open to thoughts.

The user should be in control of the rendering itself through the builder pattern, enabling them to choose output colorspaces, HDR tone maps, contrast, resolution, and so forth.

It should be able to accurately model white light passing through a glass prism or lens and splitting into its components. The end spectrum should be collected using the XYZ CMF. We may need an optional de-noising pass.

#### Who:
Used by 3D artists or tinkerers who want to play with spectral rendering and materials with different dispersions and optical properties.

#### How:
For bonus points, the objects in the rendered scene should be able to be directly manipulated via 3D handles. Moving an object should re-render the scene at a rough quality before more passes make it cleaner and cleaner.

#### What they see:
Mostly the rendered scene, but possibly some controls to modify the lights, camera, shapes, and their materials.

### Lens Bench

#### What:
A lens design toolkit, allowing users to explore different lens designs in cross-section, seeing a ray-traced path through the lens hitting the film plane. The user should be able to compose lenses from a variety of known optical materials, ideally live-fetching from a real catalog, but otherwise a set of manufacturer-agnostic materials available from multiple sources. The DSL would compose lens elements by size and material, and allow air gaps.

The user should be able to define the size of the imaging area they’re targeting.

For bonus points, a high-quality optimization routine that allows the user to stack-rank the most important properties they’re optimizing for (size, # of elements, spherical aberration, apochromatism) and have the optimizer factor those in and generate new designs.

#### Who:
Non-professional users who want to intuitively understand optical design, as well as professional users who want to quickly prototype new ideas.

#### How & What they see:
A lens cross-section, ideally able to be directly manipulated. Able to switch tabs to a performance tab with MTF, axial, all the typical lens charts.

### Combination Workbench 1: Virtual Camera

What this is: this DSL defines a scene using the Path Tracer’s DSL, and a lens via the Lens Bench DSL, and introduces a Camera DSL which allows spectral scenes to be captured *through a lens* designed in the Lens Bench, passing spectral light through the lens and collecting it on the film plane.

#### Who:
Users who want to evaluate “real-world” performance of lenses and simulate their optical characteristics prior to production.

#### How they interact & what they see:
They should be able to move objects as in the Path Tracer, as well as swapping lenses, optionally entering the lens design module to iterate.

### FM Synthesizer Synthesizer

#### What:
This DSL defines a language for realtime FM synthesis. The user can set things like sample rate, bit rate, number of voices, and so forth.

#### Who:
Musicians and sound designers

#### How they interact & what they see:
It would be cool if we can create a cool-looking VST style “plugin” UI that allows the user to modify the FM parameters. There should be some way to trigger notes using the keyboard, as well as an on-screen keyboard. Super bonus points if we can plug in to Web MIDI. This example will stress-test whether we can generate and emit audio.

### Combination Workbench 2: Sequencer Design Studio

#### What:
What if sequencers didn’t have to be a grid? This DSL allows the user to create arbitrary visual shapes, methods and physics modules to trigger sounds. This DSL imports the FM synth to provide sounds.

#### Who:
Experimental musicians and artists

#### How they interact & what they see:
Ideally the DSL itself can define different UIs that appear in the stage, for the user to interact with. The stress test here is how expressive we can get with dynamic UI.

### Grotesk

#### What:
A DSL for Grotesk-style typeface design. The builder pattern allows individual letters, groups of letters, or the entire face, to be built from components. The user can express things like the roundness/squircleness of the round forms, angle of attachment between arched/round forms and a straight stem, narrowing of forms as they join, light/ink traps, and obviously weight, contrast, width, and face-level things like x-height, cap height, and so forth. In this face it should be possible to compose a two-storey or single-storey `a` and `g`, a `G` with different leg styles, different `R` and `K` strategies, `Q` stroke options.

Bonus points if the font can be produced as a variable font.

At the end, the font can be emitted as an open format like .glyphs or robofont, or perhaps even a compiled font.

#### Who:
Users who want to quickly generate a unique sans for a project, or experiment with different proportions.

#### How they interact & what they see:
A Glyphs-like UI, where you can type words in your font, and double click to edit a letter. The UI should show bezier points as hidden/disabled, and instead reveal handles which correspond to the builder properties, placed where they make the most sense in-context (e.g. stem width on the side of the stem).

### Combination Workbench 3: Book

#### What:
A DSL for long-form page design. It should allow the user to specify a title page, chapter pages, body pages, TOC, index, along with properties like margin, border, leading, and everything you would want. Using this DSL it should be able to express lots of different book layouts. Bonus points if it has rules for diagrams, image placement, sidebars (including citation sidebars), footnotes, links and other common features. Definable behavior for wrapping (widow/orphan, including chapter handling), justification, indentation.

The user should be able to import a font designed in Grotesk (the combination).

#### Who:
Users who may start with a long Markdown doc but want to produce a handsome book to read the same content.

#### How they interact and what they see:
Representational pages (or arbitrary pages) with handles and easily editable properties. The user can’t edit the text, just the layout.

### Language Design Playground

#### What:
A DSL for designing programming languages. The language is composed using the DSL, which automatically creates a parser, AST, and translation to IR. The compiler has a deliberately non-optimized path from IR to a single platform (perhaps wasm). We can skip a checker or interpreter if it’s too heavy, but the system should produce meaningful error messages based on incoming syntax errors.

#### Who:
People who want to experiment with language design

#### How they interact & what they see:
A Split View or tabbed view with code entry on the left and running code on the right (maybe console output or basic 2D output). The code view ideally offers syntax highlighting based on the language, as well as contextual errors/help. What representation would we use for the language design itself? A graph view? I’m open.
