// The host's zoom and pan of the stage (project/2026-11-27-controls-draft.md, requirement 10): not logged and not part
// of the run, as a window size is not. kit/page applies the view in draw() and undoes it in pointer mapping
// (`page.setView`); this module holds the math and the navigator, which decides which canvas events are the view's
// (Ctrl or ⌘ with the wheel, a pinch, Space with a drag, a two-finger drag) and which are the part's pointer input (a
// plain wheel, and every other event). Points are canvas pixels. No DOM.

/** @typedef {{ zoom: number, pan: readonly number[] }} View */

/** The view Fit gives: the stage as drawn, unzoomed. */
export const FIT = Object.freeze({ zoom: 1, pan: Object.freeze([0, 0]) });
/** The zoom's bounds. */
export const ZOOM_MIN = 0.25, ZOOM_MAX = 16;
/** How far one pixel of wheel delta zooms: e^(−delta / WHEEL_PER_E). */
const WHEEL_PER_E = 200;

/** A copy of a view. @param {View} v @returns {View} */
const copy = (v) => ({ zoom: v.zoom, pan: [v.pan[0], v.pan[1]] });

/**
 * The view zoomed by a factor about a canvas point, which stays where it is; the zoom is clamped.
 * @param {View} v @param {number[]} at @param {number} factor @returns {View}
 */
export function zoomAt(v, at, factor) {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, pan: [at[0] - (at[0] - v.pan[0]) * k, at[1] - (at[1] - v.pan[1]) * k] };
}

/** The view moved by canvas pixels. @param {View} v @param {number[]} d @returns {View} */
export const panBy = (v, d) => ({ zoom: v.zoom, pan: [v.pan[0] + d[0], v.pan[1] + d[1]] });

/** What a wheel event is: a zoom with Ctrl or ⌘ (a trackpad pinch arrives as one), else the part's pointer input. @param {{ ctrlKey?: boolean, metaKey?: boolean }} e */
export const wheelIntent = (e) => (e.ctrlKey || e.metaKey ? "zoom" : "pointer");

/**
 * Where a canvas event goes: `page` (the part's pointer input, through kit/page), or `view` (the navigator took it,
 * and `cancel` names pointers whose page capture the host now cancels).
 * @typedef {{ to: "page" } | { to: "view", cancel?: number[] }} Route
 */

/**
 * The navigator: the view, and the routing of canvas events (`{ type, x, y, pointerId, pointerType, ctrlKey, metaKey,
 * deltaY }`, a DOM PointerEvent or WheelEvent in canvas pixels will do).
 * @param {View} [start]
 */
export function createNavigator(start = FIT) {
  let view = copy(start);
  let space = false;
  /** The Space drag in flight: its pointer and its last point. @type {{ id: number, at: number[] } | null} */
  let drag = null;
  /** The touches down, by pointer. @type {Map<number, number[]>} */
  const touches = new Map();
  /** The touches a two-finger gesture owns, until each is lifted. @type {Set<number>} */
  const gesture = new Set();
  /** The two touches' middle and distance, as last seen. @type {{ mid: number[], dist: number } | null} */
  let pair = null;
  const pairOf = () => {
    const [a, b] = [...touches.entries()].filter(([id]) => gesture.has(id)).map(([, p]) => p);
    return a && b ? { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(a[0] - b[0], a[1] - b[1]) } : null;
  };

  /** @param {Record<string, any>} e @returns {Route} */
  function pointer(e) {
    const id = Number(e.pointerId ?? 0), at = [Number(e.x), Number(e.y)];
    if (e.type === "wheel") {
      if (wheelIntent(e) !== "zoom") return { to: "page" };
      view = zoomAt(view, at, Math.exp(-Number(e.deltaY ?? 0) / WHEEL_PER_E));
      return { to: "view" };
    }
    const touch = e.pointerType === "touch";
    if (e.type === "pointerdown") {
      if (space) { drag = { id, at }; return { to: "view" }; }
      if (touch) {
        touches.set(id, at);
        if (gesture.size === 0 && touches.size >= 2) {
          const ids = [...touches.keys()].slice(0, 2);
          for (const t of ids) gesture.add(t);
          pair = pairOf();
          return { to: "view", cancel: ids.filter((t) => t !== id) };
        }
        if (gesture.size) return { to: "view" };
      }
      return { to: "page" };
    }
    if (drag && drag.id === id) {
      if (e.type === "pointermove") { view = panBy(view, [at[0] - drag.at[0], at[1] - drag.at[1]]); drag.at = at; }
      else if (e.type === "pointerup" || e.type === "pointercancel") drag = null;
      return { to: "view" };
    }
    if (touch && touches.has(id)) touches.set(id, at);
    if (gesture.has(id)) {
      if (e.type === "pointermove") {
        const now = pairOf();
        if (now && pair) {
          view = panBy(view, [now.mid[0] - pair.mid[0], now.mid[1] - pair.mid[1]]);
          if (pair.dist > 0 && now.dist > 0) view = zoomAt(view, now.mid, now.dist / pair.dist);
        }
        pair = now ?? pair;
      } else if (e.type === "pointerup" || e.type === "pointercancel") {
        touches.delete(id); gesture.delete(id); pair = null;
      }
      return { to: "view" };
    }
    if (touch && (e.type === "pointerup" || e.type === "pointercancel")) touches.delete(id);
    return { to: "page" };
  }

  return {
    /** The view now. */
    get view() { return copy(view); },
    pointer,
    /** Space held or let go: held, a drag pans. A Space a page Control takes is the page's, and the host does not pass it here. @param {boolean} down */
    space(down) { space = down; if (!down) drag = null; },
    /** Fit: the unzoomed view. */
    fit() { view = copy(FIT); },
    /** Sets the view (a host's own Zoom buttons). @param {View} v */
    set(v) { view = copy(v); },
  };
}
