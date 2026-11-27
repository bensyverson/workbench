// The panels' DOM: each function turns data the kit and ui-eval.js made into elements. They decide nothing.

import { h } from "./dom.js";
import { vectorWidget, pointsWidget, pickWidget } from "./widgets.js";

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
 * @param {{ series: (key: string) => { T: number, y: number }[], sweep: (c: any) => { running: boolean, progress: number, result: { points: { x: number, y: number }[], error?: string } | null } | null, runSweep: (c: any) => void, cancelSweep: (c: any) => void, element: (c: any) => any }} io
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
      const state = io.sweep(c);
      const swept = state?.result ?? null;
      const pts = swept?.points ?? null;
      const button = state?.running
        ? h("button", { class: "btn sm", onclick: () => io.cancelSweep(c) }, `Cancel (${Math.round(state.progress * 100)}%)`)
        : h("button", { class: "btn sm", onclick: () => io.runSweep(c) }, swept ? "Rerun" : "Run sweep");
      return h("div", { class: "comp" }, h("div", { class: "k" }, c.label, " ", button), pts && chart(pts, { bars: true }), pts && h("div", { class: "dim" }, `${c.spec.param}: ${pts.map((p) => `${p.x}→${Math.round(p.y * 100) / 100}`).join("  ")}`), swept?.error && h("div", { class: "comp bad" }, swept.error));
    }
    case "text": return h("p", { class: "comp text" }, c.text);
    case "row": case "col": return h("div", { class: `comp ${c.kind}` }, c.items.map((/** @type {any} */ i) => componentView(i, io)));
    default: return h("div", { class: "comp bad" }, `unknown component ${c.kind}`);
  }
}

/**
 * A param's editor: a slider with a number for a bounded number, a select for options, a checkbox, a text box.
 * @param {string} name @param {any} decl  `{ value, min?, max?, options? }` @param {any} annotation @param {(value: any) => void} onEdit
 * @param {unknown} [value]  the param's value now (the run's), the declared one by default
 */
export function paramEditor(name, decl, annotation, onEdit, value = decl.value) {
  const v = /** @type {any} */ (value);
  /** @type {any} */
  let input;
  // a select's edit is the option itself, not its text, so a number option stays a number (N008 refuses text)
  if (Array.isArray(decl.options)) input = h("select", { onchange: (/** @type {any} */ e) => onEdit(decl.options[e.target.selectedIndex]) }, decl.options.map((/** @type {string} */ o) => h("option", { value: String(o) }, String(o))));
  else if (typeof v === "boolean") input = h("input", { type: "checkbox", checked: v, onchange: (/** @type {any} */ e) => onEdit(e.target.checked) });
  else if (typeof v === "number") {
    const num = h("input", { type: "number", value: String(v), step: "any", min: decl.min, max: decl.max });
    const range = decl.min !== undefined && decl.max !== undefined ? h("input", { type: "range", min: decl.min, max: decl.max, step: (decl.max - decl.min) / 200, value: String(v) }) : null;
    const edit = (/** @type {any} */ e) => { const x = Number(e.target.value); if (!Number.isFinite(x)) return; num.value = String(x); if (range) range.value = String(x); onEdit(x); };
    num.oninput = edit;
    if (range) range.oninput = edit;
    input = h("span", { class: "pin" }, range, num);
  } else input = h("input", { type: "text", value: String(v), onchange: (/** @type {any} */ e) => onEdit(e.target.value) });
  if (input.tagName === "SELECT") input.value = String(v);
  return h("label", { class: "param" }, h("span", { class: "k" }, name, annotation.badge && h("span", { class: "tag live" }, annotation.badge)), input, annotation.note && h("span", { class: "dim" }, annotation.note));
}

/** Source with line numbers. @param {string} text @param {string} name */
export function codeView(text, name) {
  const lines = text.split("\n");
  return h("div", { class: "code", "aria-label": `source of ${name}` }, lines.map((l, i) => h("div", { class: "ln" }, h("span", { class: "no" }, String(i + 1)), h("code", null, l || " "))));
}

/** A scoped Control's part, as a tag. @param {any} form */
const scope = (form) => (form.part ? h("span", { class: "tag" }, form.part) : null);
/** A Control's shown name: its label, else its own name (a scoped Control is named `<part>.<control>` on the page). @param {any} form */
const shownName = (form) => form.label ?? (form.part && String(form.name).startsWith(`${form.part}.`) ? String(form.name).slice(form.part.length + 1) : form.name);

/**
 * One declared Control's on-screen form (the generated `controls` view), from its declaration: buttons laid out by
 * its grid (else in a row), a row of triggers, a slider, a checkbox, a menu, a text field, a color well, a vector's
 * components, a point list, a pick from its data file (widgets.js). A scoped Control (`part`, named `<part>.<control>`)
 * is tagged with its part, and shown by its control's own name. `send(record, phase?)` logs the Control's record
 * (`"preview"` while a Control with `to` moves, then nothing, a commit, on its change); `focus(on)` tells the page a
 * text field has the keys. A keyed Control (the form's `keyed`: its composed declaration is plain data, with no
 * `each`) shows one form per instance, each sending its record with the instance's key.
 * @param {any} form  a session form @param {(record: Record<string, unknown>, phase?: "preview") => void} send @param {(on: boolean) => void} focus
 * @param {(form: any) => ({ kind: string, text?: string, value?: unknown } | null)} [data]  a pick's data file (pick-data.js's `dataFileOf`)
 */
export function controlForm(form, send, focus, data = () => null) {
  if (form.keyed) {
    const { instances = [], ...rest } = form;
    return h("div", { class: "control keyed" }, scope(form), h("span", { class: "dim" }, shownName(form)),
      instances.map((/** @type {any} */ i) => controlForm({ ...rest, ...i, keyed: false, part: undefined, name: i.key, label: i.label ?? i.key }, (record, phase) => send({ ...record, key: i.key }, phase), focus, data)));
  }
  const label = h("span", { class: "dim" }, scope(form), shownName(form));
  /** A button that is held while pressed. @param {string} text @param {(down: boolean) => void} set */
  const hold = (text, set) => h("button", {
    class: "btn", onpointerdown: (/** @type {any} */ e) => { e.target.setPointerCapture?.(e.pointerId); set(true); },
    onpointerup: () => set(false), onpointercancel: () => set(false), onlostpointercapture: () => set(false),
  }, text);
  switch (form.kind) {
    case "buttons": {
      /** @type {Record<string, boolean>} */
      const held = Object.fromEntries(form.buttons.map((/** @type {string} */ b) => [b, false]));
      const button = (/** @type {string} */ b) => hold(b, (down) => { if (held[b] === down) return; held[b] = down; send({ ...held }); });
      if (!form.grid) return h("div", { class: "control" }, label, h("div", { class: "inputs" }, form.buttons.map(button)));
      const cols = Math.max(...form.grid.map((/** @type {unknown[]} */ r) => r.length));
      return h("div", { class: "control" }, label, h("div", { class: "grid", style: `grid-template-columns: repeat(${cols}, 44px)` },
        form.grid.flat().map((/** @type {string | null} */ b) => (b === null ? h("span") : button(b)))));
    }
    case "triggers": {
      const first = form.first ?? 0;
      return h("div", { class: "control" }, label, h("div", { class: "inputs" }, Array.from({ length: form.count }, (_, i) => hold(String(first + i), (on) => send({ index: first + i, on, velocity: 1 })))));
    }
    case "number": {
      // with to, a slider previews while it moves and commits once it is let go
      const to = typeof form.to === "string";
      return h("label", { class: "control" }, label, h("input", {
        type: "range", min: form.min, max: form.max, step: form.step ?? "any", value: form.value, ...(to && form.disabled ? { disabled: true, title: `${form.disabled.code} ${form.disabled.message}` } : {}),
        oninput: (/** @type {any} */ e) => (to ? send({ value: Number(e.target.value) }, "preview") : send({ value: Number(e.target.value) })),
        ...(to ? { onchange: (/** @type {any} */ e) => send({ value: Number(e.target.value) }) } : {}),
      }));
    }
    case "toggle": return h("label", { class: "control" }, label, h("input", { type: "checkbox", checked: !!form.value, onchange: (/** @type {any} */ e) => send({ value: e.target.checked }) }));
    case "choice": return h("label", { class: "control" }, label, h("select", { onchange: (/** @type {any} */ e) => send({ value: e.target.value }) }, form.options.map((/** @type {string} */ o) => h("option", { value: o, ...(o === form.value ? { selected: true } : {}) }, o))));
    case "text": return h("label", { class: "control" }, label, h("input", { type: "text", value: form.value ?? "", maxlength: form.max ?? 256, onfocus: () => focus(true), onblur: () => focus(false), oninput: (/** @type {any} */ e) => send({ value: e.target.value }) }));
    case "color": {
      const hex = (/** @type {number[]} */ c) => `#${c.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
      return h("label", { class: "control" }, label, h("input", { type: "color", value: hex(form.value), oninput: (/** @type {any} */ e) => send({ value: [1, 3, 5].map((i) => parseInt(e.target.value.slice(i, i + 2), 16) / 255) }) }));
    }
    case "vector": return h("div", { class: "control" }, label, vectorWidget(form, send));
    case "points": return h("div", { class: "control" }, label, pointsWidget(form, send));
    case "pick": return h("div", { class: "control" }, label, pickWidget(form, send, () => data(form)));
    default: return h("label", { class: "control" }, label, h("input", { type: "text", value: JSON.stringify(form.value ?? null), onfocus: () => focus(true), onblur: () => focus(false), onchange: (/** @type {any} */ e) => { try { send({ value: JSON.parse(e.target.value) }); } catch { /* not JSON yet: nothing is sent */ } } }));
  }
}
