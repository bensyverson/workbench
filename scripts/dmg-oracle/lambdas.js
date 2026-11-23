// Finds every runtime lambda in a compiled DMG spec and gives each a stable id, so
// the M1 pipeline can replace one with emitted code. The runtime reads each
// record's `fn` live, so replacing `record.fn` is enough.

/** @import { DmgSpec, FnRecord, Lambda, PartSpec } from "./dmg.js" */

/**
 * @typedef {"onFrame" | "method" | "on" | "init" | "hud" | "draw" | "timer" | "every" | "after" | "done" | "bot"} SlotKind
 * @typedef {object} Slot
 * @property {string} id      Stable id, e.g. `Mole.onFrame#0`, `Whackable.method(whack)`, `timer(spawn).every`.
 * @property {SlotKind} kind
 * @property {string} owner   The part that declared it (a fragment's name for fragment lambdas).
 * @property {string[]} usedBy The merged parts that run it (components, or the Game's name for the world).
 * @property {string} src     `String(fn)`, the exact source text.
 * @property {(fn: Lambda) => void} replace
 */

/**
 * Lists every runtime lambda in `spec`, each once, in a deterministic order.
 * Build-time lambdas (background, board, bake) are not included.
 * @param {DmgSpec} spec
 * @returns {Slot[]}
 */
export function lambdaSlots(spec) {
  /** @type {Map<object, Slot>} */
  const byRecord = new Map();
  /** @type {Map<string, number>} */
  const counters = new Map();
  /** @type {Slot[]} */
  const slots = [];

  /**
   * @param {object} key        Identity of the holder, so shared fragment records are listed once.
   * @param {SlotKind} kind
   * @param {string} owner
   * @param {string} usedBy
   * @param {string} id
   * @param {() => Lambda} get
   * @param {(fn: Lambda) => void} set
   */
  const add = (key, kind, owner, usedBy, id, get, set) => {
    const seen = byRecord.get(key);
    if (seen) { if (!seen.usedBy.includes(usedBy)) seen.usedBy.push(usedBy); return; }
    const slot = { id, kind, owner, usedBy: [usedBy], src: String(get()), replace: set };
    byRecord.set(key, slot);
    slots.push(slot);
  };
  /**
   * Adds a record whose id needs a per-owner index (several onFrames, handlers, inits or HUDs).
   * The index is only taken for records not seen before, so shared fragment records keep one id.
   * @param {FnRecord} r
   * @param {SlotKind} kind
   * @param {string} usedBy
   * @param {string} label  e.g. `onFrame` or `on(whack)`
   */
  const addIndexed = (r, kind, usedBy, label) => {
    const owner = r.owner ?? usedBy;
    let id = "";
    if (!byRecord.has(r)) {
      const base = `${owner}.${label}`;
      const n = counters.get(base) ?? 0;
      counters.set(base, n + 1);
      id = `${base}#${n}`;
    }
    add(r, kind, owner, usedBy, id, () => r.fn, (fn) => { r.fn = fn; });
  };
  /**
   * @param {FnRecord} r
   * @param {SlotKind} kind
   * @param {string} owner
   * @param {string} usedBy
   * @param {string} id
   */
  const addRecord = (r, kind, owner, usedBy, id) => add(r, kind, owner, usedBy, id, () => r.fn, (fn) => { r.fn = fn; });

  /** @param {PartSpec} part */
  const walkPart = (part) => {
    const usedBy = part.name;
    for (const r of part.frames) addIndexed(r, "onFrame", usedBy, "onFrame");
    for (const [name, r] of Object.entries(part.methods)) addRecord(r, "method", r.owner ?? usedBy, usedBy, `${r.owner ?? usedBy}.method(${name})`);
    for (const [evt, list] of Object.entries(part.on)) for (const r of list) addIndexed(r, "on", usedBy, `on(${evt})`);
    for (const r of part.inits) addIndexed(r, "init", usedBy, "init");
    for (const r of part.huds) addIndexed(r, "hud", usedBy, "hud");
    if (part.draw) addRecord(part.draw, "draw", usedBy, usedBy, `${usedBy}.draw`);
  };

  walkPart(spec.world);
  for (const name of Object.keys(spec.comps)) walkPart(spec.comps[name]);
  for (const t of spec.timers) {
    add(t, "timer", spec.name, spec.name, `timer(${t.name})`, () => t.fn, (fn) => { t.fn = fn; });
    const every = t.every;
    if (every && typeof every.fn === "function") add(every, "every", spec.name, spec.name, `timer(${t.name}).every`, () => /** @type {Lambda} */ (every.fn), (fn) => { every.fn = fn; });
    const after = t.after;
    if (after && typeof after.fn === "function") add(after, "after", spec.name, spec.name, `timer(${t.name}).after`, () => /** @type {Lambda} */ (after.fn), (fn) => { after.fn = fn; });
  }
  if (spec.done) addRecord(spec.done, "done", spec.name, spec.name, "done");
  if (spec.bot) addRecord(spec.bot, "bot", spec.name, spec.name, "bot");
  return slots;
}

/**
 * Replaces the lambda with id `id` in `spec`; the runtime will call `fn` from then on.
 * @param {DmgSpec} spec
 * @param {string} id
 * @param {Lambda} fn
 */
export function swapLambda(spec, id, fn) {
  const slots = lambdaSlots(spec);
  const slot = slots.find((s) => s.id === id);
  if (!slot) throw new Error(`no lambda '${id}' in ${spec.name}; lambdas are ${slots.map((s) => s.id).join(", ")}`);
  slot.replace(fn);
}
