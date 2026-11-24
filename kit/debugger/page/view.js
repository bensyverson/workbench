// DOM drawing for a trace: the source with the current span marked, the steps beside it, and the
// per-line summary used by the fixed sections. Everything shown comes from the library's trace.
import { groupByLine, finalColor, compareColor } from "../index.js";

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className = "", text = "") {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * The source of the current step's kernel, its span marked.
 * @param {HTMLElement} into
 * @param {import("../trace.js").PixelTrace} trace
 * @param {import("../trace.js").Step} step
 */
export function drawSource(into, trace, step) {
  const src = trace.sources[step.kernel];
  const pre = el("pre", "src");
  const [a, b] = step.span;
  const mark = el("mark", "", src.slice(a, b));
  pre.append(src.slice(0, a), mark, src.slice(b));
  into.replaceChildren(el("div", "kernel-name", step.kernel), pre);
  mark.scrollIntoView({ block: "nearest" });
}

/**
 * A color as a swatch with its components.
 * @param {number[]} color
 */
export function swatch(color) {
  const s = el("span", "swatch");
  s.style.background = `rgb(${color.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)).join(",")})`;
  return s;
}

/**
 * The steps as a table, the current one highlighted; `onPick` is told which row was clicked.
 * @param {HTMLElement} into
 * @param {import("../trace.js").PixelTrace} trace
 * @param {number} current
 * @param {{ helpers: boolean, onPick: (index: number) => void }} opts
 */
export function drawSteps(into, trace, current, { helpers, onPick }) {
  const table = /** @type {HTMLTableElement} */ (el("table", "steps"));
  const head = table.createTHead().insertRow();
  for (const h of ["#", "node", "source", "value"]) head.append(el("th", "", h));
  const body = table.createTBody();
  for (const s of trace.steps) {
    if (!helpers && s.depth > 0 && s.index !== current) continue;
    const row = body.insertRow();
    if (s.index === current) row.className = "current";
    row.dataset.index = String(s.index);
    row.addEventListener("click", () => onPick(s.index));
    row.insertCell().textContent = String(s.index);
    const node = row.insertCell();
    node.textContent = `${s.kind}${s.stmt ? " (stmt)" : ""}`;
    node.style.paddingLeft = `${0.5 + s.depth}em`;
    const text = row.insertCell();
    text.textContent = s.text.length > 48 ? `${s.text.slice(0, 45)}...` : s.text;
    text.title = `${s.kernel} line ${s.line}`;
    row.insertCell().textContent = s.shown;
  }
  into.replaceChildren(table);
  into.querySelector("tr.current")?.scrollIntoView({ block: "nearest" });
}

/**
 * The line-by-line summary of a whole trace: for each source line of the pixel Kernel and its helpers that ran,
 * how many nodes it evaluated and the value of the last.
 * @param {HTMLElement} into
 * @param {import("../trace.js").PixelTrace} trace
 */
export function drawLines(into, trace) {
  const table = /** @type {HTMLTableElement} */ (el("table", "lines"));
  const head = table.createTHead().insertRow();
  for (const h of ["kernel", "line", "source", "nodes", "last value"]) head.append(el("th", "", h));
  const body = table.createTBody();
  for (const g of groupByLine(trace)) {
    if (g.steps[0].depth > 0) continue;
    const row = body.insertRow();
    row.insertCell().textContent = g.kernel.split(".").pop() ?? g.kernel;
    row.insertCell().textContent = String(g.line);
    row.insertCell().textContent = g.text.trim();
    row.insertCell().textContent = String(g.steps.length);
    row.insertCell().textContent = g.steps.at(-1)?.shown ?? "";
  }
  into.replaceChildren(table);
}

/**
 * The interpreter's final color beside the GPU's, and where they differ.
 * @param {HTMLElement} into
 * @param {import("../trace.js").PixelTrace} trace
 * @param {Uint8Array | null} gpu  The bytes read back, or null when there is no GPU value.
 */
export function drawCompare(into, trace, gpu) {
  const color = /** @type {number[] | null} */ (finalColor(trace));
  into.replaceChildren();
  if (!color) {
    into.textContent = "The pixel never returned a color.";
    return;
  }
  into.append(swatch(color), el("code", "", ` interpreter ${trace.steps.findLast((s) => s.depth === 0 && s.kind === "return")?.shown}`));
  if (!gpu) {
    into.append(el("div", "dim", "No GPU value for this pixel."));
    return;
  }
  const c = compareColor(color, gpu);
  into.append(el("br"), swatch(Array.from(gpu).map((b) => b / 255)), el("code", "", ` GPU bytes ${c.gpu.join(", ")} (interpreter would store ${c.expected.join(", ")})`));
  const verdict = el("div", c.maxDelta === 0 ? "ok" : "differs", c.maxDelta === 0 ? "Same byte in every channel." : `Differs by ${c.delta.join(", ")} steps of 255 (largest ${c.maxDelta}).`);
  into.append(verdict);
}
