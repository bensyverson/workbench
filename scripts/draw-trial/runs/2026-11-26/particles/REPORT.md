# Report: particles author

## Difficulty

**2.** A pen loop with one ellipse per particle passed on the first check; the only real decisions were the max and what a particle's color should mean to a stranger.

## What you did

All in `particles/particles.dialect.js`:

- **Port `ports.out.view`**, seam `Draw<10000>@px`, built with `pen`: one filled `ellipse` per entry of `s.particles`, centered at `[p.x, p.y]`, radius `p.size / 2`. The note says what is drawn, in which frame, what the colors mean, and that there is no background, so a stranger can lay it over their own picture.
- **Helpers** `tint(p)` (which third of its life the particle is in) and `radius(p)` (half the size, never below 0).
- **Colors** `young` `#fff1a8`, `middle` `#ff9a2e`, `old` `#c2362bb0` (translucent).
- **Images, state, runtime, frames:** nothing added. `state.particles` already held all the picture reads, and `px` was already declared.
- **Version** 0.2.0 to 0.3.0 in `wb-package.json`, then `./hash.sh particles`.

Nothing existing was removed or renamed. I ran `check.sh` once: "no violations". All seven examples built lists of only ellipses, none outside the stage. The largest per-example lists were 86, 78, 62, 80, 20, 8 and 4 ops. I did not run a Program anywhere near 10000 particles, or view the picture as pixels.

## Where the docs misled you

Nothing led me wrong. One sentence was easy to under-read. `draw.md` says "a `Draw<<max>>` shown on a renderer whose limit is lower is refused when the workbench is composed", next to a table whose Game Boy limit is "40 sprites". It does not say that the sprite limit is compared with the max of any list, whatever ops it holds. The checker does that: "the Game Boy draws at most 40 sprites; a Draw seam doesn't say which ops it holds, so the composition is refused".

## What you guessed

- **Max:** 10000, the largest `maxParticles` the Grammar allows.
- **What `size` means:** the docs and the package don't say. I took it as the diameter in px. The existing stage ignores it and draws 2 by 2 squares, so my picture looks different from the stage.
- **Color:** by `age` against `life` in thirds. I compared by multiplying, so `life = 0` never divides. Such a particle comes out `old`.
- **Negative size:** radius 0, so the particle is invisible.
- **Port name:** `view`, so it is the one shown if the part ever has several.
- **No background, box or stroke,** so the picture layers over another.
- **Painter's order:** state order, so newly spawned particles lie on top.
- **Outside the box:** a particle spawned outside the bounds is drawn where it is until the next tick removes it. I did not clip.
- **Alpha:** I assumed a renderer honors `#rrggbbaa`. `draw.md` does not say what the Game Boy does with alpha.

## Gaps

Smallest first.

1. **No stated way for a Program to choose its particles' look.** The builder belongs to the Dialect and cannot know what a Program's `.field("heat")` means, so I used only the built-ins. A new Grammar slot filled into state by the runtime might do it. I did not try that, and `draw.md` neither shows it nor says whether a color string may come from a Program's lambda.
2. **The max cannot depend on the Program.** `record.maxParticles` is 100 to 2000 in examples 01 to 06 (400 in 07), but the seam must say 10000 for every Program. A stranger's `Draw` input must then take at least 10000, and their output must add that to their own ops.
3. **The seam says how many ops, not which kinds.** A renderer cannot tell at composition whether a long list is 40 sprites or 10000 ellipses. It refuses on the count alone.
4. **No way to draw a particle on a Game Boy at its size.** It has no free shapes, and refuses an image drawn at another `size`. Images also have no pixel data, so a dot sprite could only be declared, not drawn.

## Answers

### 1. The bridge

About 18 lines: 9 for the port (including its 3-line pen), 6 for the colors with their comment, and 3 for the two helpers with their comment. There are no images, state or runtime lines. The most work was deciding things, not writing them: the max, and what `size` and color should mean. The note was the longest single piece of text.

### 2. The pen and the max

I declared 10000. It is what the Grammar allows for `maxParticles` and what the state list holds, and the runtime never keeps more than `maxParticles`, so the pen cannot exceed it. A smaller number would make some legal Program fail with W005. The examples' own limits fit with a great deal of room (at most 2000 declared, 86 ops seen). I did not use `map` or anything else the docs don't give: a `for…of` over `s.particles` and one pen method were enough.

### 3. Ops and frames

I used `ellipse` only. I considered:

- `rect`: it matches the stage's squares, but needs the corner computed from the center.
- `line`: a streak along the velocity. The stage has no such look, so I left it out.
- `image`: it needs pixel data the trial doesn't have, and would not follow `size` on a Game Boy.
- `tiles`: a density grid, discussed below.

Everything is in `px`, the frame the particles already live in, so there is no conversion in the package. The fields reach the picture like this:

- **Position:** `x` and `y` become `at`.
- **Size:** `size` becomes `r`, which the wire scales.
- **Age and life:** they become one of three color names, which cross as the colors they name.
- **A Program's own `.field`s:** they do not reach the picture directly. They only show if the Program writes them into `size`, as example 01 does with `heat`. Example 02's `opacity` does not show at all.
- **Velocity and emitter:** not used.

### 4. Renderers

The Canvas renderer drew every list, one op per particle, with nothing outside the stage. The Game Boy profile refused every one ("draws no free shapes, only tiles and sprite cells"). It also refused the composition, because the max of 10000 is over 40.

As written, these particles cannot run on a Game Boy. Two routes might work, and I tried neither:

- **Sprites:** declare an 8 by 8 dot image and draw one `image` per particle without `size`. This needs a max of 40 or less and at most 10 on a row, so only small systems would fit. Particle size would be lost. Example 01 alone reached 86 live particles.
- **Tiles:** have the runtime keep a grid of particle counts per cell and draw it as one `tiles` op. This removes the particle limit but gives a coarse density picture. The grid would depend on the bounds and on the frame scale, and `tiles` converts only `at` on a wire.

Either would be a different picture from the Canvas one. A package offers one list and does not target a renderer, so I kept the ellipses.

## Files

Read, in `/private/tmp/e3qYus-particles`:

- `task.md`, `rules.md`, `draw.md`, `seams.md`, `runtime.md`, `packaging.md`
- `particles/wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.runtime.js`, `particles.ui.js`, `particles-field.js`
- `particles/examples/01.js` to `07.js`, `particles/refusals/r01.js` to `r06.js`

**Beyond the list I was given:**

- I printed the two tool scripts, `check.sh` and `hash.sh`. They name script paths outside the folder, which I did not open.
- I counted the lines of `log.jsonl` (`wc -l`) to confirm how many checks had run. I did not display its contents.
- A directory listing showed the names of `stderr.txt` and `transcript.jsonl`. I did not open them.

I opened no other files myself and did not search the web. The session supplied my user-level instructions without my opening them.
