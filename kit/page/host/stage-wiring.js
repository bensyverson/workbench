// The stage canvas's DOM wiring: the Grips drawn in a layer above it (one handle each, kept by part, Grip and index,
// so a drag keeps its element), the pointer and the wheel routed by viewport.js's navigator (the zoom and pan) or to
// the part (kit/page's page.pointer), Space for the pan, and Fit. Thin: the Grips' places and drags are the session's,
// the routing is the navigator's.

import { h, fill } from "./dom.js";

/**
 * @param {{
 *   $: (id: string) => any,
 *   session: () => any,
 *   nav: ReturnType<typeof import("./viewport.js").createNavigator>,
 *   problem: (message: string) => void,
 *   showLock: (session: any) => void,
 * }} o  `session()` the running session, or null
 */
export function wireStage(o) {
  const { $, nav } = o;
  const canvas = $("stage");
  /** @type {Map<string, any>} */
  const gripEls = new Map();

  /** A client point in canvas pixels. @param {{ clientX: number, clientY: number }} e */
  const canvasPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
  };

  /** The Grips at their places now: a handle each, a disabled one grayed with its H011. @param {any} session */
  function showGrips(session) {
    const layer = $("grips");
    if (canvas.hidden) { fill(layer); gripEls.clear(); return; }
    const r = canvas.getBoundingClientRect(), outer = layer.getBoundingClientRect();
    const seen = new Set();
    for (const g of session.grips()) {
      const key = `${g.part}.${g.grip}.${g.index}`;
      seen.add(key);
      let el = gripEls.get(key);
      if (!el) { el = gripHandle(g); gripEls.set(key, el); layer.append(el); }
      el.style.left = `${r.left - outer.left + (g.x * r.width) / canvas.width}px`;
      el.style.top = `${r.top - outer.top + (g.y * r.height) / canvas.height}px`;
      el.classList.toggle("off", !!g.disabled);
      el.title = g.disabled ? `${g.disabled.code} ${g.disabled.message}` : `${g.label ?? g.grip} (${g.to})`;
    }
    for (const [key, el] of gripEls) if (!seen.has(key)) { el.remove(); gripEls.delete(key); }
  }

  /** A Grip's handle: a drag previews through the page, and the release writes back. @param {any} g */
  function gripHandle(g) {
    const el = h("span", { class: `grip ${g.kind}`, role: "slider", "aria-label": g.label ?? g.grip });
    /** @type {{ move: (x: number, y: number, o?: { alt?: boolean }) => void, release: () => unknown } | null} */
    let drag = null;
    el.addEventListener("pointerdown", (/** @type {PointerEvent} */ e) => {
      const s = o.session();
      if (!s || el.classList.contains("off")) return;
      e.preventDefault(); e.stopPropagation();
      if (s.page.locked) s.page.unlock();
      const [x, y] = canvasPoint(e);
      try { drag = s.grab({ part: g.part, grip: g.grip, index: g.index }, x, y); el.setPointerCapture(e.pointerId); } catch (err) { o.problem(err instanceof Error ? err.message : String(err)); }
    });
    el.addEventListener("pointermove", (/** @type {PointerEvent} */ e) => { if (drag) { const [x, y] = canvasPoint(e); drag.move(x, y, { alt: e.altKey }); } });
    const end = () => { if (drag) { drag.release(); drag = null; } };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    return el;
  }

  // the pointer on the stage, in canvas pixels: the navigator's (Ctrl or ⌘ with the wheel, a pinch, Space with a drag,
  // a two-finger drag), else the part's under it (kit/page routes it)
  /** @param {PointerEvent | WheelEvent} e */
  const onPointer = (e) => {
    const s = o.session();
    if (!s) return;
    const [x, y] = canvasPoint(e);
    const route = nav.pointer({ type: e.type, x, y, pointerId: /** @type {any} */ (e).pointerId ?? 0, pointerType: /** @type {any} */ (e).pointerType, ctrlKey: e.ctrlKey, metaKey: e.metaKey, deltaY: /** @type {any} */ (e).deltaY ?? 0 });
    if (route.to === "view") {
      e.preventDefault();
      for (const id of route.cancel ?? []) s.page.pointer({ type: "pointercancel", x, y, pointerId: id });
      s.setView(nav.view);
      showGrips(s);
      return;
    }
    const taken = s.page.pointer({ type: e.type, x, y, pointerId: /** @type {any} */ (e).pointerId ?? 0, buttons: e.buttons, detail: e.detail, deltaX: /** @type {any} */ (e).deltaX ?? 0, deltaY: /** @type {any} */ (e).deltaY ?? 0, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, timeStamp: e.timeStamp });
    if (taken) e.preventDefault();
    o.showLock(s);
  };
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"]) canvas.addEventListener(t, onPointer);
  // not passive, so a Ctrl+wheel zoom can keep the browser from zooming the whole page
  canvas.addEventListener("wheel", onPointer, { passive: false });
  $("fit").onclick = () => { nav.fit(); const s = o.session(); if (s) { s.setView(nav.view); showGrips(s); } };

  return {
    showGrips,
    /** A key the page's Controls did not take: Space held is the pan's (Space with a drag). @param {KeyboardEvent} e */
    key(e) { if (e.code === "Space") { nav.space(e.type === "keydown"); if (e.target === canvas) e.preventDefault(); } },
  };
}
