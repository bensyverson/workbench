# glow: per-pixel lighting

*Generated reference, draft. Import: `import { glow } from "glow";`*

A glow part lights an image one pixel at a time on the GPU: its kernel runs for every pixel of every frame and returns that pixel's color. It compiles to a GLSL ES 3.00 fragment shader.

**Clock:** `frame`. It runs once per display frame, after every other part.

**Frame:** `px`, the same pixels as the image it lights: `(0, 0)` is the top-left pixel, `x` right, `y` down. Glow has no cell frame and no conversions of its own.

**Target:** GPU. Its kernel may read parameters and scalar, vector or enum signals (each becomes a uniform). It may not read a `Grid`, an array, an `Image` other than its own, or an `Event` (S203).

## Builder

```ts
glow(name: string)                          // a new glow part

  .over(image: Image@px)                    // the image to light; sets the size. Either this or .size is required
  .size(width: int, height: int)            // no image: light a black canvas of this size in px, fixed at build
  .light(fn: (p: Pixel) => vec3)            // (runtime, GPU) the color of one pixel, each channel 0–1. Required
  .tint(rgb: vec3 | () => vec3)             // multiplies the result; a lambda (runtime) when it changes. Default [1, 1, 1]
```

Each may be called once; `.over` and `.size` exclude each other.

## The pixel context

The `p` that `.light` receives:

```ts
p.xy: vec2@px         // this pixel's center
p.uv: vec2            // the same, scaled to 0–1 across the image
p.size: vec2@px       // the image size
p.color: vec3         // the image's color at this pixel (black with .size)
p.t: f32              // seconds since the program started
```

## Outputs

```ts
out.image: Image@px   // the lit image
```

## Example (glow alone)

```js
import { glow } from "glow";

export const sky = glow("sky")
  .size(256, 160)
  .light(p => {
    const d = distance(p.xy, vec2(128, 80));
    const pulse = 0.5 + 0.5 * sin(p.t * 2.0);
    const k = 1.0 - smoothstep(10.0, 60.0 + 20.0 * pulse, d);
    return vec3(0.2, 0.3, 0.6) * p.uv.y + vec3(1.0, 0.8, 0.4) * k;
  });
```

## Errors this dialect gives

- `.light` missing; both or neither of `.over` and `.size`.
- An unknown member of `p`.
- A kernel outside the kernel subset (the GPU also has no `for…of`), or reading a name it cannot see.
- A signal of a type the GPU cannot take (S203).
