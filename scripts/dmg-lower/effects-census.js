// Counts what every DMG preset's lowered lambdas touch, to ask how much shared state the games use:
// `node scripts/dmg-lower/effects-census.js`. Each lambda falls in the first class that fits: it writes the
// world (`World.*`, the board `bg`) or spawns, emits or destroys; it writes an entity's fields (its own, a
// trait's host, or one an event or timer handed it: the IR names the kind, not the instance); it has other
// effects only (hud, sfx, input, toast, log, end, rng); or it only reads and calls. An entry that does not
// lower has no effects to count: it is skipped, and the count of those is printed.
import { pathToFileURL } from "node:url";
import { loadDmg } from "../dmg-oracle/load.js";
import { lowerPreset } from "./pipeline.js";

/**
 * @typedef {{ entries: number, lambdas: number, skipped: number,
 *   classes: { world: number, entity: number, other: number, pure: number },
 *   verbs: Record<string, number>, worldPlaces: Record<string, number> }} Census
 *   verbs and worldPlaces count lambdas: each lambda once per verb it carries and per world place it writes
 */

/**
 * The census over every preset's lambdas.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @returns {Census}
 */
export function census(dmg) {
  /** @type {Map<string, number>} */ const verbs = new Map();
  /** @type {Map<string, number>} */ const worldPlaces = new Map();
  const bump = (/** @type {Map<string, number>} */ m, /** @type {string} */ key) => m.set(key, (m.get(key) ?? 0) + 1);
  let entries = 0, lambdas = 0, pure = 0, entity = 0, world = 0, other = 0;
  for (const p of dmg.presets) {
    for (const e of lowerPreset(dmg, p.id).entries) {
      entries++;
      const k = e.result.kernel;
      if (!k) continue;
      lambdas++;
      const effects = (k.effects ?? []).map(String);
      /** @type {Set<string>} */ const ownVerbs = new Set();
      /** @type {Set<string>} */ const ownPlaces = new Set();
      let sh = false, ent = false;
      for (const x of effects) {
        const [verb, place = ""] = x.split(" ");
        ownVerbs.add(verb);
        if (verb === "write" && (place.startsWith("World.") || place === "bg" || place.startsWith("bg."))) { sh = true; ownPlaces.add(place); }
        else if (verb === "write") ent = true;
        if (verb === "spawn" || verb === "emit" || verb === "destroy") sh = true;
      }
      for (const v of ownVerbs) bump(verbs, v);
      for (const pl of ownPlaces) bump(worldPlaces, pl);
      if (sh) world++; else if (ent) entity++; else if (effects.every((x) => x.startsWith("read ") || x.startsWith("call "))) pure++; else other++;
    }
  }
  /** @param {Map<string, number>} m */
  const sorted = (m) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
  return { entries, lambdas, skipped: entries - lambdas, classes: { world, entity, other, pure }, verbs: sorted(verbs), worldPlaces: sorted(worldPlaces) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = census(loadDmg());
  console.log(`lambdas lowered: ${c.lambdas}; skipped (did not lower): ${c.skipped} of ${c.entries} entries`);
  console.log(`writes the world or spawns/emits/destroys: ${c.classes.world}; writes entity fields only: ${c.classes.entity}; other effects only: ${c.classes.other}; reads and calls only: ${c.classes.pure}`);
  console.log("effect verbs (lambdas carrying each):", c.verbs);
  console.log("world places written (lambdas writing each):", c.worldPlaces);
}
