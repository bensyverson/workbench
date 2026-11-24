# shader-diff: the comparison harness from Node

The thin Node consumer of [kit/harness](../../kit/harness/README.md): it runs the fields sketches through the interpreter, the emitted JS and the emitted GLSL, and prints the worst difference per pair. GLSL runs by loading the harness page (`kit/harness/page.html`) in **`sleepy`**, a headless WebKit browser (`/opt/homebrew/bin/sleepy`, the runner Ben chose in job DR0XNq): `sleepy eval <page> --file-root kit/ --wait-for js:!!window.workbenchHarness --file -`, with the shaders sent as the script on stdin and the pixels returned as base64 floats. No npm dependency.

```sh
node scripts/shader-diff/cli.js check             # swirl, bulge, domain-warp: recorded grids and param sets (about 25 s)
node scripts/shader-diff/cli.js check --scale 0.2 --no-glsl   # JS against the interpreter alone, at a small grid
node scripts/shader-diff/cli.js stress            # domain-warp at the edge of its ranges: the tolerance's headroom
node scripts/shader-diff/cli.js faults            # planted faults in each backend: which are caught, which escape
node scripts/shader-diff/cli.js renderer          # what WebGL reports: vendor, renderer, float readback
```

`--json` gives any verb's result; `--tolerance <n>` overrides every figure (the target's and any case's; a case with an override is then reported as `held to <n> by --tolerance`). Exit codes: `check` 1 when a pair differs, `faults` 1 when a fault changed nothing, an escape has no recorded reason or a claimed escape was caught, 2 for usage errors (and `renderer` with no usable renderer).

**sleepy and the sandbox.** sleepy launches WebKit through macOS services, so inside the Bash sandbox it fails (`sandbox_extension_issue_mach … launchservicesd`); run it with the sandbox off. Where sleepy is absent or cannot run, the CLI says why and runs the JS half alone (`GLSL skipped: …`), and the prerelease test skips with the same message.

**Renderer.** WebGL reports what it is, and the harness prints it. On the machine the figures were measured on it is `Apple GPU` (vendor `Apple Inc.`, WebGL 2.0, through WebKit), a real GPU, not a software renderer; sleepy offers no way to ask for another, so a software-renderer figure was not measured.

## Planted faults

[`kit/harness/faults.js`](../../kit/harness/faults.js) (`FAULTS`): 28 faults (operator swaps, constant nudges, swizzles, dropped roundings, spelling changes in what a backend emitted). Each is planted in one backend's copy of the lowered Kernels or its emitted text and run over the case that exercises it, at 0.49 scale; the interpreter stays the reference. A fault is caught when the pair holding the faulty backend differs: bit for bit for JS, beyond the GLSL target's declared figure for GLSL. A fault that is expected to escape carries its reason (`escapes`), and `faults` fails if an escape has none, or if one claimed is caught. The recorded run is in the [M2 findings](../../project/2026-11-23-m2-findings.md).

## Tests

`test/shader-diff.test.js` (fast): the CLI's verbs and exit codes with `--no-glsl`, and the report's wording. `prerelease/glsl.prerelease.js` (run it with `npm run test:prerelease`; about a minute): the recorded cases at full size with GLSL within tolerance, the stress case (held to its stated override), and the fault run in both backends; it skips with a message where sleepy is absent.
