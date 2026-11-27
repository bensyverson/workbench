// The panels' DOM: each function turns data the kit and ui-eval.js made into elements. They decide nothing.

import { h } from "./dom.js";

/** @typedef {import("./load.js").HostDiagnostic} HostDiagnostic */

/**
 * Every diagnostic, grouped by where it came from, errors first within a group.
 * @param {{ source: string, severity: string, code: string, text: string }[]} list
 */
export function diagnosticsView(list) {
  if (!list.length) return h("p", { class: "dim" }, "No diagnostics.");
  /** @type {Map<string, typeof list>} */
  const groups = new Map();
  for (const d of list) groups.set(d.source, [...(groups.get(d.source) ?? []), d]);
  return h("div", null, [...groups].map(([source, ds]) => h("div", { class: "dgroup" },
    h("h4", null, source, h("span", { class: "tag" }, String(ds.length))),
    [...ds].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error")).map((d) => h("pre", { class: `diag ${d.severity}` }, d.text.startsWith(d.code) ? d.text : `${d.code} ${d.text}`)))));
}

/** A line chart on a canvas. @param {{ x: number, y: number }[]} pts @param {{ w?: number, h?: number, bars?: boolean }} [o] */
export function chart(pts, { w = 220, h: ht = 44, bars = false } = {}) {
  const c = /** @type {HTMLCanvasElement} */ (h("canvas", { width: w, height: ht, class: "chart" }));
  const g = c.getContext("2d");
  if (!g || pts.length === 0) return c;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  const sx = (/** @type {number} */ x) => 2 + (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * (w - 4));
  const sy = (/** @type {number} */ y) => ht - 2 - (y1 === y0 ? 0 : ((y - y0) / (y1 - y0)) * (ht - 4));
  g.strokeStyle = g.fillStyle = getComputedStyle(c).color;
  if (bars) pts.forEach((p) => g.fillRect(sx(p.x) - 2, sy(p.y), 4, ht - 2 - sy(p.y)));
  else { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.y)) : g.moveTo(sx(p.x), sy(p.y)))); g.stroke(); }
  return c;
}

/**
 * One evaluated component.
 * @param {Record<string, any>} c
 * @param {{ series: (key: string) => { T: number, y: number }[], sweep: (c: any) => { points: { x: number, y: number }[], error?: string } | null, runSweep: (c: any) => void, element: (c: any) => any }} io
 * @returns {any}
 */
export function componentView(c, io) {
  if (c.error) return h("div", { class: "comp bad" }, `${c.label ?? c.kind}: ${c.error}`);
  switch (c.kind) {
    case "stat": return h("div", { class: `comp stat${c.bad ? " bad" : ""}` }, h("span", { class: "k" }, c.label), h("b", null, c.text, c.max !== undefined ? ` / ${c.max}` : "", c.unit ? ` ${c.unit}` : ""));
    case "check": return h("div", { class: `comp check${c.ok ? "" : " bad"}` }, h("span", { class: "k" }, c.label), h("b", null, c.ok ? "pass" : "FAIL"));
    case "table": return h("div", { class: "comp" }, h("div", { class: "k" }, c.label),
      h("table", null, h("thead", null, h("tr", null, c.columns.map((/** @type {string} */ x) => h("th", null, x)))), h("tbody", null, c.rows.map((/** @type {string[]} */ r) => h("tr", null, r.map((x) => h("td", null, x)))))));
    case "plot": return h("div", { class: "comp" }, h("div", { class: "k" }, c.label, " ", h("b", null, String(Math.round(c.y * 1000) / 1000))), chart(io.series(c.key).map((p) => ({ x: p.T, y: p.y }))));
    case "runs": {
      const swept = io.sweep(c);
      const pts = swept?.points ?? null;
      return h("div", { class: "comp" }, h("div", { class: "k" }, c.label, " ", h("button", { class: "btn sm", onclick: () => io.runSweep(c) }, swept ? "Rerun" : "Run sweep")), pts && chart(pts, { bars: true }), pts && h("div", { class: "dim" }, `${c.spec.param}: ${pts.map((p) => `${p.x}→${Math.round(p.y * 100) / 100}`).join("  ")}`), swept?.error && h("div", { class: "comp bad" }, swept.error));
    }
    case "text": return h("p", { class: "comp text" }, c.text);
    case "row": case "col": return h("div", { class: `comp ${c.kind}` }, c.items.map((/** @type {any} */ i) => componentView(i, io)));
    default: return h("div", { class: "comp bad" }, `unknown component ${c.kind}`);
  }
}

/**
 * A param's editor: a slider with a number for a bounded number, a select for options, a checkbox, a text box.
 * @param {string} name @param {any} decl  `{ value, min?, max?, options? }` @param {any} annotation @param {(value: any) => void} onEdit
 */
export function paramEditor(name, decl, annotation, onEdit) {
  const v = decl.value;
  /** @type {any} */
  let input;
  if (Array.isArray(decl.options)) input = h("select", { onchange: (/** @type {any} */ e) => onEdit(e.target.value) }, decl.options.map((/** @type {string} */ o) => h("option", { value: o }, o)));
  else if (typeof v === "boolean") input = h("input", { type: "checkbox", checked: v, onchange: (/** @type {any} */ e) => onEdit(e.target.checked) });
  else if (typeof v === "number") {
    const num = h("input", { type: "number", value: String(v), step: "any", min: decl.min, max: decl.max });
    const range = decl.min !== undefined && decl.max !== undefined ? h("input", { type: "range", min: decl.min, max: decl.max, step: (decl.max - decl.min) / 200, value: String(v) }) : null;
    const edit = (/** @type {any} */ e) => { const x = Number(e.target.value); if (!Number.isFinite(x)) return; num.value = String(x); if (range) range.value = String(x); onEdit(x); };
    num.oninput = edit;
    if (range) range.oninput = edit;
    input = h("span", { class: "pin" }, range, num);
  } else input = h("input", { type: "text", value: String(v), onchange: (/** @type {any} */ e) => onEdit(e.target.value) });
  if (input.tagName === "SELECT") input.value = v;
  return h("label", { class: "param" }, h("span", { class: "k" }, name, annotation.badge && h("span", { class: "tag live" }, annotation.badge)), input, annotation.note && h("span", { class: "dim" }, annotation.note));
}

/** Source with line numbers. @param {string} text @param {string} name */
export function codeView(text, name) {
  const lines = text.split("\n");
  return h("div", { class: "code", "aria-label": `source of ${name}` }, lines.map((l, i) => h("div", { class: "ln" }, h("span", { class: "no" }, String(i + 1)), h("code", null, l || " "))));
}
