// A hand-written DMG program's declarations, shaped like presets 04–07, and a helper
// that lowers one lambda against them. Shared by the lowering tests.

import { dmgEnvironment } from "../../dialects/dmg/index.js";
import { lowerLambda } from "../index.js";

/** @import { DmgDeclarations } from "../../dialects/dmg/decls.js" */
/** @import { SlotRef, Signatures } from "../environment.js" */

/** @type {DmgDeclarations} */
export const DECLS = {
  game: "fixture",
  world: {
    attrs: { next: { type: "u8" }, score: { type: "u16", max: 9999 }, secs: { type: "u8" } },
    methods: ["award"],
  },
  comps: {
    Mole: {
      attrs: { up: { type: "bool" }, ttl: { type: "u16" }, rise: { type: "u8" } },
      baked: { stay: "f64" },
      methods: ["pop", "whack"],
      sprites: ["up", "peek"],
      count: 9,
    },
    Spark: {
      attrs: { vx: { type: "fix" }, vy: { type: "fix" }, life: { type: "u8" } },
      baked: {},
      methods: [],
      sprites: ["big", "small"],
      count: 24,
    },
    Hammer: { attrs: { cell: { type: "u8" } }, baked: {}, methods: [], sprites: ["idle"], count: 1 },
  },
  params: {
    spawn: { kind: "slider", live: true },
    linger: { kind: "slider", live: false },
    order: { kind: "choice", live: true, options: ["random", "sweep"] },
    sound: { kind: "toggle", live: true },
    burst: { kind: "slider", live: true },
  },
  pools: { sparks: { comp: "Spark", size: 24 } },
  board: { comp: "Mole", size: 9 },
  grid: { rows: 3, cols: 3 },
  aliases: { hammer: "Hammer" },
  sfx: ["pop", "fizz"],
};

export const environment = dmgEnvironment(DECLS);

/**
 * Lowers `src` as the slot `kind` on `on` (an entity kind or `World`).
 * @param {string} src
 * @param {string} kind
 * @param {string} [on]
 * @param {{ key?: string, sigs?: Signatures }} [opts]
 */
export function lower(src, kind = "onFrame", on = "Mole", opts = {}) {
  /** @type {SlotRef} */
  const slot = { id: `${on}.${kind}`, kind, on, key: opts.key };
  return lowerLambda(environment, src, slot, opts.sigs);
}

/**
 * The codes of a lowering's diagnostics.
 * @param {{ diagnostics: Array<{ code: string }> }} r
 */
export const codes = (r) => r.diagnostics.map((d) => d.code);
