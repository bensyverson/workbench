// The pixel debugger's preview page: wires the library to the DOM. It renders each program's shader,
// takes a click as a pixel, and asks the library for the trace; fixed sections show review states.
import { lowerField } from "../../dialects/fields/index.js";
import { swirl, bulge } from "../../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { tracePixel, uniformsFor, pixelUv, pixelOfUv } from "../index.js";
import { createRenderer } from "./gl.js";
import { drawSource, drawSteps, drawLines, drawCompare } from "./view.js";

const SIZE = 150;
const PROGRAMS = { swirl, bulge, "domain-warp": domainWarp };

/** @type {Array<{ title: string, note: string, program: import("../../dialects/fields/decls.js").FieldProgram, i: number, j: number }>} */
const FIXED = [
  { title: "swirl at (0, 0)", note: "Outside the lens: the `if (dist < R)` branch is not taken, and the grid's red line is hit.", program: swirl, i: 0, j: 0 },
  { title: "swirl at (57, 66)", note: "Inside the lens: the branch is taken and the pixel lands in the grey disc.", program: swirl, i: 57, j: 66 },
  { title: "domain-warp at (32, 32)", note: "Default params (fog palette, two levels): `fbm` runs inside the pixel kernel, at depth above 0.", program: domainWarp, i: 32, j: 32 },
];

const $ = (/** @type {string} */ sel, /** @type {ParentNode} */ root = document) => /** @type {HTMLElement} */ (root.querySelector(sel));

/**
 * One trace of `program` at pixel (i, j) (column, row from the bottom), and the GPU's byte for it.
 * @param {ReturnType<typeof createRenderer>} renderer
 * @param {ReturnType<typeof lowerField>} lowering
 * @param {import("../../dialects/fields/decls.js").FieldProgram} program
 * @param {number} i
 * @param {number} j
 */
function traceAt(renderer, lowering, program, i, j) {
  const uniforms = uniformsFor(program);
  return { trace: tracePixel(lowering, { uv: pixelUv(i, j, SIZE, SIZE), uniforms }), gpu: renderer.readPixel(i, j) };
}

/** Marks pixel (i, j) over a canvas's wrapper. */
function placeMarker(/** @type {HTMLElement} */ marker, /** @type {number} */ i, /** @type {number} */ j) {
  marker.hidden = false;
  marker.style.left = `${((i + 0.5) / SIZE) * 100}%`;
  marker.style.top = `${(1 - (j + 0.5) / SIZE) * 100}%`;
}

function interactive() {
  const select = /** @type {HTMLSelectElement} */ ($("#program"));
  const canvas = /** @type {HTMLCanvasElement} */ ($("#main-canvas"));
  const marker = $("#marker");
  const state = { name: "", lowering: /** @type {ReturnType<typeof lowerField> | null} */ (null), renderer: /** @type {any} */ (null), trace: /** @type {import("../trace.js").PixelTrace | null} */ (null), gpu: /** @type {Uint8Array | null} */ (null), current: 0, pixel: /** @type {{ i: number, j: number } | null} */ (null) };

  function show() {
    const { trace } = state;
    if (!trace) return;
    const step = trace.steps[state.current];
    drawSource($("#source"), trace, step);
    drawSteps($("#steps"), trace, state.current, { helpers: /** @type {HTMLInputElement} */ ($("#helpers")).checked, onPick: (n) => { state.current = n; show(); } });
    $("#step-info").textContent = `step ${state.current + 1} of ${trace.steps.length}: ${step.kind} at depth ${step.depth}, line ${step.line}`;
    $("#current-value").textContent = `${step.text.length > 60 ? `${step.text.slice(0, 57)}...` : step.text} = ${step.shown}`;
    /** @type {HTMLInputElement} */ ($("#scrub")).max = String(trace.steps.length - 1);
    /** @type {HTMLInputElement} */ ($("#scrub")).value = String(state.current);
  }

  function pick(/** @type {number} */ i, /** @type {number} */ j) {
    if (!state.lowering) return;
    state.pixel = { i, j };
    const { trace, gpu } = traceAt(state.renderer, state.lowering, PROGRAMS[/** @type {keyof typeof PROGRAMS} */ (state.name)], i, j);
    state.trace = trace;
    state.gpu = gpu;
    state.current = trace.steps.length - 1;
    $("#pixel-info").textContent = `pixel (${i}, ${j}), uv ${pixelUv(i, j, SIZE, SIZE).map((n) => n.toFixed(4)).join(", ")}`;
    placeMarker(marker, i, j);
    drawCompare($("#compare"), trace, gpu);
    show();
  }

  function load(/** @type {string} */ name) {
    const program = PROGRAMS[/** @type {keyof typeof PROGRAMS} */ (name)];
    state.name = name;
    state.lowering = lowerField(program);
    // A canvas keeps the context type of its first getContext, so each program gets a fresh canvas.
    const fresh = /** @type {HTMLCanvasElement} */ (canvas.cloneNode(false));
    canvas.replaceWith(fresh);
    state.renderer = createRenderer(fresh, state.lowering);
    state.renderer.draw(uniformsFor(program));
    fresh.id = "main-canvas";
    fresh.addEventListener("click", onClick);
    marker.hidden = true;
    state.trace = null;
    return fresh;
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const c = /** @type {HTMLCanvasElement} */ (e.currentTarget);
    const r = c.getBoundingClientRect();
    const { i, j } = pixelOfUv([(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height], SIZE, SIZE);
    pick(i, j);
  }

  function move(/** @type {number} */ to) {
    if (!state.trace) return;
    state.current = Math.min(state.trace.steps.length - 1, Math.max(0, to));
    show();
  }

  select.addEventListener("change", () => { load(select.value); pick(75, 75); });
  $("#first").addEventListener("click", () => move(0));
  $("#prev").addEventListener("click", () => move(state.current - 1));
  $("#next").addEventListener("click", () => move(state.current + 1));
  $("#last").addEventListener("click", () => move(Infinity));
  $("#scrub").addEventListener("input", (e) => move(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("#helpers").addEventListener("change", show);
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== "checkbox") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(state.current + 1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(state.current - 1); }
  });
  for (const name of Object.keys(PROGRAMS)) select.append(new Option(name, name));
  load(select.value);
  pick(57, 66);
  // Exposed for checking the page from a headless browser; the page itself does not read it.
  Object.assign(window, { debuggerState: state });
}

function fixed() {
  const host = $("#fixed");
  for (const f of FIXED) {
    const section = document.createElement("section");
    section.className = "fixed";
    section.innerHTML = `<h3></h3><p class="note"></p><div class="row"><div class="canvas-wrap"><canvas width="${SIZE}" height="${SIZE}"></canvas><div class="marker"></div></div><div class="compare"></div></div><div class="lines"></div>`;
    $("h3", section).textContent = f.title;
    $(".note", section).textContent = f.note;
    host.append(section);
    const lowering = lowerField(f.program);
    const renderer = createRenderer(/** @type {HTMLCanvasElement} */ ($("canvas", section)), lowering);
    renderer.draw(uniformsFor(f.program));
    const { trace, gpu } = traceAt(renderer, lowering, f.program, f.i, f.j);
    placeMarker($(".marker", section), f.i, f.j);
    drawCompare($(".compare", section), trace, gpu);
    const info = document.createElement("p");
    info.className = "dim";
    info.textContent = `${trace.steps.length} nodes evaluated, ${trace.steps.filter((s) => s.depth > 0).length} of them inside helpers.`;
    $(".compare", section).append(info);
    drawLines($(".lines", section), trace);
  }
}

try {
  interactive();
  fixed();
} catch (e) {
  $("#error").hidden = false;
  $("#error").textContent = String(e instanceof Error ? e.message : e);
  console.error(e);
}
