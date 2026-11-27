// The smallest element builder the panels use.

/**
 * `h("div", { class: "a", onclick: fn, hidden: true }, child, "text", [more])`: attributes are set as properties for
 * `on…` handlers and `value`, `checked`, `disabled`, `hidden`; `class` and the rest as attributes. A `null`, `false` or
 * `undefined` child is skipped, an array is flattened.
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]
 * @param {...any} children
 * @returns {any}
 */
export function h(tag, attrs, ...children) {
  const el = /** @type {any} */ (document.createElement(tag));
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") || ["value", "checked", "disabled", "hidden", "textContent"].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  /** @param {any} c */
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

/** Replaces an element's children. @param {any} el @param {...any} children */
export function fill(el, ...children) {
  el.replaceChildren();
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
