// The generated controls view's widgets for the kinds that are more than one input: a vector's components, a point
// list, a pick from a data file (project/2026-11-27-controls-draft.md, "Control kinds"). Each takes the form and a
// `send(record)` and returns the element; the record is the Control's own (`{ value }`, a pick's with its carried
// columns). They decide nothing about the run: bounds are the declaration's, and the kit's N012 judges the rest.

import { h } from "./dom.js";
import { pickTable, pickRecord } from "./pick-data.js";

/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** A bound that may be one number for every component or a list. @param {unknown} b @param {number} i @param {number} fallback */
const bound = (b, i, fallback) => (Array.isArray(b) ? Number(b[i] ?? fallback) : typeof b === "number" ? b : fallback);

/**
 * A slider with a number box, kept together, each edit clamped to lo..hi.
 * @param {number} value @param {number} lo @param {number} hi @param {string} title @param {(x: number) => void} onEdit
 */
function ranged(value, lo, hi, title, onEdit) {
  const num = h("input", { type: "number", value: String(value), step: "any", min: lo, max: hi, title });
  const range = h("input", { type: "range", min: lo, max: hi, step: (hi - lo) / 200, value: String(value), title });
  /** @param {any} e */
  const edit = (e) => {
    const raw = Number(e.target.value);
    if (e.target.value === "" || !Number.isFinite(raw)) return;
    const x = clamp(raw, lo, hi);
    num.value = String(x); range.value = String(x);
    onEdit(x);
  };
  num.oninput = edit; range.oninput = edit;
  return h("span", { class: "pin" }, range, num);
}

/**
 * A vector: one slider and number per component (x, y, z), each within the declaration's `min..max`; every edit
 * sends the whole vector.
 * @param {any} form @param {(record: Record<string, unknown>) => void} send
 */
export function vectorWidget(form, send) {
  const dims = form.dims === 3 ? 3 : 2;
  /** @type {number[]} */
  const value = Array.from({ length: dims }, (_, i) => Number(form.value?.[i] ?? bound(form.min, i, 0)));
  return h("div", { class: "inputs vector" }, value.map((v, i) => h("label", { class: "param" }, h("span", { class: "k" }, "xyz"[i]),
    ranged(v, bound(form.min, i, 0), bound(form.max, i, 1), `${"xyz"[i]} of ${form.label ?? form.name}`, (x) => { value[i] = x; send({ value: [...value] }); }))));
}

/**
 * A point list: a row per point with its x and y (each within the declared `x` and `y` ranges), a button to remove
 * it, and one to add a point (at the middle of the ranges) until `max`. Every change sends the whole list.
 * @param {any} form @param {(record: Record<string, unknown>) => void} send
 */
export function pointsWidget(form, send) {
  const [x0, x1] = form.x ?? [0, 1], [y0, y1] = form.y ?? [0, 1];
  const max = Number(form.max ?? Infinity);
  /** @type {number[][]} */
  const points = (form.value ?? []).map((/** @type {number[]} */ p) => [Number(p[0]), Number(p[1])]);
  const box = h("div", { class: "points" });
  const add = h("button", { class: "btn sm", onclick: () => { if (points.length >= max) return; points.push([(x0 + x1) / 2, (y0 + y1) / 2]); change(); } }, "Add point");
  const change = () => { draw(); send({ value: points.map((p) => [...p]) }); };
  const draw = () => {
    box.replaceChildren();
    points.forEach((p, i) => box.append(h("div", { class: "inputs point" },
      ranged(p[0], x0, x1, `x of point ${i}`, (x) => { p[0] = x; send({ value: points.map((q) => [...q]) }); }),
      ranged(p[1], y0, y1, `y of point ${i}`, (y) => { p[1] = y; send({ value: points.map((q) => [...q]) }); }),
      h("button", { class: "btn sm", title: `remove point ${i}`, onclick: () => { points.splice(i, 1); change(); } }, "x"))));
    add.disabled = points.length >= max;
  };
  draw();
  return h("div", { class: "control-points" }, box, add);
}

/**
 * A pick: a filter box and a list of the data file's rows (the key column, then the `show` columns), the declared
 * `value` selected; choosing a row sends `{ value: <key>, <carried columns> }`. A file the page cannot read is said,
 * not hidden.
 * @param {any} form @param {(record: Record<string, unknown>) => void} send
 * @param {() => ({ kind: string, text?: string, value?: unknown } | null)} file  the form's data file
 */
export function pickWidget(form, send, file) {
  const t = pickTable(file(), form);
  if (t.error !== undefined) return h("span", { class: "comp bad" }, `${form.label ?? form.name}: ${t.error}`);
  const shown = form.show ?? [];
  const text = (/** @type {Record<string, any>} */ r) => [r[form.key], ...shown.filter((/** @type {string} */ c) => c !== form.key).map((/** @type {string} */ c) => r[c])].join("  ");
  const select = h("select", { size: "6", class: "pick" });
  const list = (/** @type {string} */ q) => t.rows.filter((r) => text(r).toLowerCase().includes(q.toLowerCase()));
  /** The rows the select shows now. @type {Array<Record<string, any>>} */
  let showing = [];
  const fillList = (/** @type {string} */ q) => {
    showing = list(q);
    select.replaceChildren();
    showing.forEach((r) => select.append(h("option", { value: String(r[form.key]), ...(String(r[form.key]) === String(form.value) ? { selected: true } : {}) }, text(r))));
  };
  fillList("");
  select.onchange = (/** @type {any} */ e) => { const r = showing[e.target.selectedIndex]; if (r) send(pickRecord(r, form)); };
  return h("span", { class: "pin" }, h("input", { type: "search", placeholder: "filter", oninput: (/** @type {any} */ e) => fillList(e.target.value) }), select);
}
