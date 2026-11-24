// The DMG Workbench's runtime surface, described in the kit's terms: what `self`,
// `w` and the HUD's `at` offer a runtime lambda, with types and effects, and the
// calling convention of every slot. Built per program from its declarations.

import { dialectEnum } from "../../ir/types.js";

/** @import { Type, Coerce, Effect, EffectVerb } from "../../ir/ir.js" */
/** @import { Environment, ObjectDecl, Member, SlotDecl, SlotRef, FnSig } from "../../lower/environment.js" */
/** @import { DmgDeclarations, AttrDecl } from "./decls.js" */

/** The world object's name in types and effects. */
export const WORLD = "World";

/** Buttons as `normBtn` accepts them. */
const BUTTONS = ["up", "down", "left", "right", "A", "B", "start", "select", "a", "b"];

/** Effects that change state; a render-time slot may perform none of them. */
const ALL_EFFECTS = /** @type {EffectVerb[]} */ (["read", "input", "hud", "call", "write", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"]);
const STATE_CHANGES = /** @type {EffectVerb[]} */ (["write", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"]);

const F64 = /** @type {Type} */ ("f64");
const BOOL = /** @type {Type} */ ("bool");
const VOID = /** @type {Type} */ ("void");
const W = /** @type {Type} */ ({ obj: WORLD });
const T = /** @type {Type} */ ({ tvar: "T" });

/**
 * @param {Type[]} params
 * @param {Type} returns
 * @param {Effect[]} [effects]
 * @param {Partial<FnSig>} [more]
 * @returns {Member}
 */
const fn = (params, returns, effects = [], more = {}) => ({ kind: "fn", params, returns, effects, ...more });

/**
 * @param {Type} t
 * @param {Effect} [effect]
 * @param {Coerce} [store]
 * @param {boolean} [size] a read-only number that stays small, so it can bound a loop
 * @returns {Member}
 */
const value = (t, effect, store, size) => ({ kind: "value", t, ...(effect ? { effect } : {}), ...(store ? { store } : {}), ...(size ? { size } : {}) });

/**
 * The value type and store rule of a declared attribute.
 * @param {AttrDecl} a
 * @returns {{ t: Type, store: Coerce }}
 */
function attrType(a) {
  /** @type {Coerce} */
  const store = { type: a.type };
  if (a.min != null) store.min = a.min;
  if (a.max != null) store.max = a.max;
  if (a.type === "enum") store.values = a.values ?? [];
  const t = a.type === "bool" ? BOOL : a.type === "enum" ? dialectEnum(a.values ?? []) : F64;
  return { t, store };
}

/**
 * The environment for one DMG program: the DMG dialect plus that program's declarations.
 * @param {DmgDeclarations} d
 * @returns {Environment}
 */
export function dmgEnvironment(d) {
  const kinds = Object.keys(d.comps);
  /** @type {Type} */
  const anyEntity = kinds.length === 1 ? { ref: kinds[0] } : { union: kinds.map((k) => ({ ref: k })) };
  const printable = /** @type {Type} */ ({ union: ["f64", "str", "bool"] });

  /** @type {Record<string, ObjectDecl>} */
  const objects = {};

  for (const [kind, c] of Object.entries(d.comps)) {
    /** @type {Record<string, Member>} */
    const members = {
      x: value(F64, `read ${kind}.x`, { type: "f64" }),
      y: value(F64, `read ${kind}.y`, { type: "f64" }),
      visible: value(BOOL, `read ${kind}.visible`, { type: "bool" }),
      alive: value(BOOL, `read ${kind}.alive`, { type: "bool" }),
      id: value(F64), index: value(F64), row: value(F64), col: value(F64),
      group: value("str"), kind: value(dialectEnum([kind])),
      world: value(W),
      destroy: fn([], VOID, [`destroy ${kind}`]),
      hits: fn([anyEntity], BOOL, [`read ${kind}.x`]),
    };
    for (const [name, t] of Object.entries(c.baked)) members[name] = value(t);
    for (const [name, a] of Object.entries(c.attrs)) {
      const { t, store } = attrType(a);
      members[name] = value(t, `read ${kind}.${name}`, store);
    }
    for (const m of c.methods) members[m] = { kind: "method", owner: kind, name: m };
    objects[kind] = { label: kind, members };
  }

  /** @type {Record<string, Member>} */
  const world = {
    world: value(W),
    frame: value(F64, "read frame"),
    // The world proxy's set trap takes both. `over = true` ends the game (as w.end("set")),
    // `over = false` resumes it; oamStart stores (v | 0) & 255, which is u8's
    // truncate-then-wrap for any finite value within int32 (a non-finite one stores 0).
    over: value(BOOL, `read ${WORLD}.over`, { type: "bool" }),
    oamStart: value(F64, `read ${WORLD}.oamStart`, { type: "u8" }),
    input: value({ obj: "Input" }),
    bg: value({ obj: "Bg" }),
    rng: value({ obj: "Rng" }),
    rand: fn([F64], F64, ["rng"], { minArgs: 0 }),
    emit: { kind: "emit", effects: ["emit {key}"] },
    sfx: { kind: "keyed", what: "sound", keys: Object.fromEntries(d.sfx.map((s) => [s, { params: [], returns: VOID }])), effects: ["sfx {key}"] },
    toast: fn([printable, printable], VOID, ["toast"], { minArgs: 1 }),
    log: fn([], VOID, ["log"], { rest: printable }),
    end: fn(["str"], VOID, ["end"], { minArgs: 0 }),
    overlap: fn([anyEntity, anyEntity], BOOL, ["read overlap"]),
    param: {
      kind: "keyed", what: "param", effects: ["read param {key}"],
      keys: Object.fromEntries(Object.entries(d.params).map(([name, p]) => {
        const opts = p.options ?? [];
        /** @type {Type} */
        const t = p.kind === "toggle" ? BOOL : p.kind === "choice" && opts.every((o) => typeof o === "string") ? dialectEnum(/** @type {string[]} */ (opts)) : F64;
        return [name, { params: [], returns: t }];
      })),
    },
    spawn: {
      kind: "keyed", what: "pool", effects: ["spawn {key}"],
      keys: Object.fromEntries(Object.entries(d.pools).map(([name, p]) => [name, {
        params: [initFields(d, p.comp)], minArgs: 0, returns: { opt: { ref: p.comp } },
      }])),
    },
    pool: {
      kind: "keyed", what: "pool", effects: ["read pool {key}"],
      keys: Object.fromEntries(Object.entries(d.pools).map(([name, p]) => [name, { params: [], returns: { list: { ref: p.comp }, max: p.size } }])),
    },
    all: {
      kind: "keyed", what: "component", effects: ["read {key}.alive"],
      keys: Object.fromEntries(Object.entries(d.comps).map(([k, c]) => [k, { params: [], returns: { list: { ref: k }, max: c.count } }])),
    },
    one: {
      kind: "keyed", what: "component", effects: ["read {key}.alive"],
      keys: Object.fromEntries(kinds.map((k) => [k, { params: [], returns: { opt: { ref: k } } }])),
    },
  };
  if (d.board) world.board = value({ list: { ref: d.board.comp }, max: d.board.size, with: "Board" });
  if (d.grid) world.grid = value({ obj: "Grid" });
  for (const [alias, kind] of Object.entries(d.aliases)) world[alias] = value({ ref: kind });
  for (const [name, a] of Object.entries(d.world.attrs)) {
    const { t, store } = attrType(a);
    world[name] = value(t, `read ${WORLD}.${name}`, store);
  }
  for (const m of d.world.methods) world[m] = { kind: "method", owner: WORLD, name: m };
  objects[WORLD] = { label: "the world", members: world };

  const buttons = /** @type {Type} */ (dialectEnum(BUTTONS));
  const xy = /** @type {Type} */ ({ struct: { x: F64, y: F64 } });
  objects.Input = {
    label: "w.input",
    members: {
      held: fn([buttons], BOOL, ["input"]), pressed: fn([buttons], BOOL, ["input"]),
      released: fn([buttons], BOOL, ["input"]), repeat: fn([buttons], BOOL, ["input"]),
      dpad: fn([], xy, ["input"]), axis: fn([], xy, ["input"]),
    },
  };
  // The background map: tiles are named, and the runtime throws on a name the program has no tile for.
  // The declarations do not list tile names, so a name is a plain `str` here. Cell coordinates wrap
  // around the 32×32 map, so any number is allowed. `fill`, `rect` and `text` are not described:
  // no preset calls them from a runtime lambda (only from `.background`, which runs at build time).
  const bg = /** @type {Type} */ ({ obj: "Bg" });
  objects.Bg = {
    label: "w.bg",
    members: {
      get: fn([F64, F64], "str", ["read bg"]),
      at: fn([F64, F64], "str", ["read bg", "read bg.scroll"]),
      cell: fn([F64, F64], { struct: { cx: F64, cy: F64 } }, ["read bg.scroll"]),
      set: fn([F64, F64, "str"], bg, ["write bg"]),
      scroll: fn([F64, F64], bg, ["write bg.scroll"], { minArgs: 1 }),
    },
  };
  objects.Rng = {
    label: "w.rng",
    members: {
      int: fn([F64], F64, ["rng"]),
      pick: fn([{ list: T, max: Infinity }], { opt: T }, ["rng"]),
      chance: fn([F64], BOOL, ["rng"]),
    },
  };
  objects.Grid = {
    label: "w.grid",
    members: {
      rows: value(F64, undefined, undefined, true), cols: value(F64, undefined, undefined, true),
      step: fn([F64, F64, F64], F64), rc: fn([F64], { struct: { r: F64, c: F64 } }),
    },
  };
  if (d.board) objects.Board = { label: "w.board", members: { at: fn([F64], { ref: d.board.comp }), all: value({ list: { ref: d.board.comp }, max: d.board.size }) } };
  const cell = /** @type {Type} */ ({ obj: "Cell" });
  objects.Cell = {
    label: "a HUD cell",
    members: {
      text: fn(["str"], cell, ["hud"], { rest: printable }),
      ink: fn([F64], cell, ["hud"]), paper: fn([F64], cell, ["hud"]),
      bar: fn([F64, F64, F64], cell, ["hud"], { minArgs: 2 }),
    },
  };
  objects.At = { label: "at", members: {}, call: { params: [F64, F64], returns: cell, effects: [] } };
  const math1 = fn([F64], F64);
  objects.Math = {
    label: "Math",
    members: {
      max: fn([], F64, [], { rest: F64 }), min: fn([], F64, [], { rest: F64 }), hypot: fn([], F64, [], { rest: F64 }),
      floor: math1, ceil: math1, round: math1, trunc: math1, abs: math1, sign: math1, sqrt: math1,
      sin: math1, cos: math1, tan: math1, atan: math1, log: math1, exp: math1,
      atan2: fn([F64, F64], F64), pow: fn([F64, F64], F64),
      PI: value(F64), E: value(F64),
    },
  };

  /** @param {string} kind @returns {Type} */
  const drawResult = (kind) => {
    const sprites = dialectEnum(d.comps[kind]?.sprites ?? []);
    return { union: [sprites, { struct: { sprite: sprites, x: F64, y: F64, flipX: BOOL, flipY: BOOL }, optional: ["sprite", "x", "y", "flipX", "flipY"] }, "null"] };
  };

  return {
    name: "dmg",
    objects,
    list: { length: value(F64) },
    queries: ["filter", "find", "some", "every", "reduce"],
    globals: { Math: { obj: "Math" } },
    slot: (ref) => slotOf(ref, d, drawResult),
  };
}

/**
 * The fields `w.spawn(pool, init)` may set: the kind's attributes and position.
 * @param {DmgDeclarations} d
 * @param {string} kind
 * @returns {Type}
 */
function initFields(d, kind) {
  /** @type {Record<string, Type>} */
  const fields = { x: F64, y: F64, visible: BOOL };
  for (const [name, a] of Object.entries(d.comps[kind]?.attrs ?? {})) fields[name] = attrType(a).t;
  return { struct: fields, optional: Object.keys(fields) };
}

/**
 * The calling convention of each DMG slot (the slot table in project/2026-11-23-dmg-workbench-read.md).
 * @param {SlotRef} ref
 * @param {DmgDeclarations} d
 * @param {(kind: string) => Type} drawResult
 * @returns {SlotDecl | string}
 */
function slotOf(ref, d, drawResult) {
  // A top-level helper has no `self`; a constant is evaluated once, before the game runs, so it may touch no state.
  if (ref.kind === "helper") return { params: [], inferParams: true, returns: "infer", space: `helper ${ref.key}`, forbid: [] };
  if (ref.kind === "const") return { params: [], returns: "infer", space: `constant ${ref.key}`, forbid: ALL_EFFECTS, forbidWhy: "a baked constant is computed once, so it may not read or change the game" };
  const isWorld = ref.on === WORLD;
  if (!isWorld && !d.comps[ref.on]) return `'${ref.on}' is not a component of this game`;
  /** @type {Type} */
  const self = isWorld ? W : { ref: ref.on };
  const renderWhy = "draw and hud run at render time, so a change there would depend on how often the screen is drawn";
  /** @param {Omit<SlotDecl, "forbid"> & { forbid?: EffectVerb[] }} s */
  const slot = (s) => ({ forbid: [], ...s });
  switch (ref.kind) {
    case "onFrame": return slot({ params: [self, W], returns: VOID, space: isWorld ? "tick" : `entity ${ref.on}` });
    case "init": return slot({ params: [self, W], returns: VOID, space: isWorld ? "reset" : `spawn ${ref.on}` });
    case "method": return slot({ params: [self], inferParams: true, returns: "infer", space: `call ${ref.on}.${ref.key}` });
    case "on": return slot({ params: isWorld ? [W, "payload"] : [self, "payload", W], returns: VOID, space: `event ${ref.key}` });
    case "timer": return slot({ params: [W, W], returns: VOID, space: "tick" });
    case "done": return slot({ params: [W, W], returns: BOOL, space: "tick" });
    case "bot": return slot({ params: [W, W], returns: { union: [dialectEnum(BUTTONS), "null"] }, space: "tick" });
    case "every": case "after":
      return slot({ params: [W], returns: F64, space: "timer interval", forbid: [...STATE_CHANGES, "hud"], forbidWhy: "a timer's interval is read whenever it re-arms" });
    case "hud":
      if (!isWorld) return "a hud belongs to the world";
      return slot({ params: [W, { obj: "At" }], returns: VOID, space: "render", forbid: STATE_CHANGES, forbidWhy: renderWhy });
    case "draw":
      if (isWorld) return "draw belongs to a component";
      return slot({ params: [self, W], returns: drawResult(ref.on), space: `render ${ref.on}`, forbid: [...STATE_CHANGES, "hud"], forbidWhy: renderWhy });
  }
  return `the DMG has no '${ref.kind}' slot`;
}
