// Keys to declared Controls (project/2026-11-27-controls-draft.md, requirement 4): the page knows no key of its own.
// Each Control's `keys` map KeyboardEvent codes to its targets, and a host override, `{ "<code>": "<target>" }`,
// replaces a target's codes. The held state turns key events into page inputs: one record per change for buttons,
// triggers and a toggle (a repeat sends nothing), a nudge per key down for a number and a choice.

import { keyCodesOf } from "../define/ui/controls.js";

/** @import { PageControl } from "../compose/page.js" */

/**
 * Every key target the page's Controls offer: `<control>.<button>`, `<control>[<i>]` (a trigger), `<control>.down`
 * and `.up` (a number), `<control>.prev` and `.next` (a choice), and `<control>` (a toggle).
 * @param {Record<string, PageControl>} controls @returns {string[]}
 */
export function keyTargets(controls) {
  /** @type {string[]} */
  const out = [];
  for (const [n, c] of Object.entries(controls)) {
    const d = c.decl;
    if (c.kind === "buttons") for (const b of d.buttons) out.push(`${n}.${b}`);
    else if (c.kind === "triggers") for (let i = 0; i < d.count; i++) out.push(`${n}[${i}]`);
    else if (c.kind === "number") out.push(`${n}.down`, `${n}.up`);
    else if (c.kind === "choice") out.push(`${n}.prev`, `${n}.next`);
    else if (c.kind === "toggle") out.push(n);
  }
  return out;
}

/** A declaration's target text for one of its key bindings. @param {string} n @param {string} kind @param {string} t */
const targetText = (n, kind, t) => (kind === "triggers" ? `${n}[${t}]` : kind === "toggle" ? n : `${n}.${t}`);

/**
 * The key map: each KeyboardEvent code to the Control and target it plays. The declarations' codes come first, in
 * declaration order (the first Control declared takes a code two bind, as S121 warns); an override replaces every code
 * of each target it names. Throws naming a target no Control offers.
 * @param {Record<string, PageControl>} controls @param {Record<string, string>} [override]
 * @returns {Map<string, { control: string, target: string }>}
 */
export function keyMap(controls, override = {}) {
  if (override === null || typeof override !== "object" || Array.isArray(override)) throw new Error("keys is an object of KeyboardEvent.code to a Control's target, such as \"<control>.<button>\"");
  const targets = keyTargets(controls);
  for (const [code, t] of Object.entries(override)) if (!targets.includes(t)) throw new Error(`keys.${code}: ${t} is not a target of the page's Controls: the targets are ${targets.join(", ") || "none"}`);
  const replaced = new Set(Object.values(override));
  /** @type {Map<string, { control: string, target: string }>} */
  const map = new Map();
  for (const [n, c] of Object.entries(controls)) {
    for (const { code, target } of keyCodesOf(c.decl)) {
      const t = targetText(n, c.kind, target);
      if (!replaced.has(t) && !map.has(code)) map.set(code, { control: n, target: t });
    }
  }
  for (const [code, t] of Object.entries(override)) {
    const control = /** @type {string} */ ([...Object.keys(controls)].find((n) => t === n || t.startsWith(`${n}.`) || t.startsWith(`${n}[`)));
    map.set(code, { control, target: t });
  }
  return map;
}

/**
 * The Controls' state, played from keys. `press(code, down)` gives the page input a change makes, `{ name, value }`,
 * null when it changes nothing (a repeat, a second code of a held button), or undefined for a code the map lacks.
 * `release()` gives the records that let go of everything held, for a blur: each held button up, each held trigger off.
 * @param {Record<string, PageControl>} controls @param {Map<string, { control: string, target: string }>} map
 */
export function keyState(controls, map) {
  /** Each code held, by target. @type {Map<string, Set<string>>} */
  const held = new Map();
  /** Each number's and choice's value now, by Control. @type {Map<string, unknown>} */
  const values = new Map(Object.entries(controls).map(([n, c]) => [n, c.decl.value]));
  const isHeld = (/** @type {string} */ t) => (held.get(t)?.size ?? 0) > 0;
  /** @param {string} n */
  const buttons = (n) => Object.fromEntries(controls[n].decl.buttons.map((/** @type {string} */ b) => [b, isHeld(`${n}.${b}`)]));
  /** @param {string} n @param {string} t @param {boolean} on */
  const trigger = (n, t, on) => ({ index: (controls[n].decl.first ?? 0) + Number(t.slice(n.length + 1, -1)), on, velocity: 1 });
  return {
    /** @param {string} code @param {boolean} down @returns {{ name: string, value: Record<string, unknown> } | null | undefined} */
    press(code, down) {
      const hit = map.get(code);
      if (!hit) return undefined;
      const { control: n, target: t } = hit;
      const c = controls[n];
      const codes = held.get(t) ?? new Set();
      held.set(t, codes);
      const was = codes.size > 0;
      if (down) codes.add(code); else codes.delete(code);
      const changed = was !== codes.size > 0;
      switch (c.kind) {
        case "buttons": return changed ? { name: n, value: buttons(n) } : null;
        case "triggers": return changed ? { name: n, value: trigger(n, t, down) } : null;
        case "toggle": {
          if (!down || !changed) return null;
          const v = !values.get(n);
          values.set(n, v);
          return { name: n, value: { value: v } };
        }
        case "number": {
          if (!down) return null;
          const d = c.decl, step = d.step ?? (d.max - d.min) / 100;
          const v = Math.min(d.max, Math.max(d.min, Number(values.get(n)) + (t.endsWith(".up") ? step : -step)));
          values.set(n, v);
          return { name: n, value: { value: v } };
        }
        case "choice": {
          if (!down) return null;
          const opts = /** @type {string[]} */ (c.decl.options);
          const i = opts.indexOf(/** @type {string} */ (values.get(n)));
          const v = opts[Math.min(opts.length - 1, Math.max(0, i + (t.endsWith(".next") ? 1 : -1)))];
          values.set(n, v);
          return { name: n, value: { value: v } };
        }
        default: return null;
      }
    },
    /** The records that release everything held, and nothing held afterward. @returns {Array<{ name: string, value: Record<string, unknown> }>} */
    release() {
      /** @type {Array<{ name: string, value: Record<string, unknown> }>} */
      const out = [];
      const buttonsHeld = new Set();
      for (const [t, codes] of held) {
        if (!codes.size) continue;
        const hit = [...map.values()].find((h) => h.target === t);
        if (!hit) continue;
        const c = controls[hit.control];
        if (c.kind === "buttons") buttonsHeld.add(hit.control);
        if (c.kind === "triggers") { codes.clear(); out.push({ name: hit.control, value: trigger(hit.control, t, false) }); }
        if (c.kind === "buttons") codes.clear();
      }
      for (const n of buttonsHeld) out.unshift({ name: n, value: buttons(n) });
      return out;
    },
  };
}
