// Counts what every DMG preset's lowered lambdas touch, to ask how much shared state the games use:
// `node scripts/dmg-lower/effects-census.js`. Each lambda falls in the first class that fits: it writes the
// world (`World.*`, the board `bg`) or spawns, emits or destroys; it writes an entity's fields (its own, a
// trait's host, or one an event or timer handed it: the IR names the kind, not the instance); it has other
// effects only (hud, sfx, input, toast, log, end, rng); or it only reads and calls.
import { loadDmg } from "../dmg-oracle/load.js";
import { lowerPreset } from "./pipeline.js";

const dmg = loadDmg();
/** @type {Map<string, number>} */ const verbs = new Map();
let lambdas = 0, pure = 0, entity = 0, world = 0, other = 0;
/** @type {Map<string, number>} */ const sharedPlaces = new Map();
for (const p of dmg.presets) {
  for (const e of lowerPreset(dmg, p.id).entries) {
    const k = e.result.kernel;
    if (!k) continue;
    lambdas++;
    const effects = (k.effects ?? []).map(String);
    let sh = false, ent = false;
    for (const x of effects) {
      const [verb, place = ""] = x.split(" ");
      verbs.set(verb, (verbs.get(verb) ?? 0) + 1);
      if (verb === "write" && (place.startsWith("World.") || place === "bg" || place.startsWith("bg."))) { sh = true; sharedPlaces.set(place, (sharedPlaces.get(place) ?? 0) + 1); }
      else if (verb === "write") ent = true;
      if (verb === "spawn" || verb === "emit" || verb === "destroy") sh = true;
    }
    if (sh) world++; else if (ent) entity++; else if (effects.every((x) => x.startsWith("read ") || x.startsWith("call "))) pure++; else other++;
  }
}
console.log(`lambdas lowered: ${lambdas}`);
console.log(`writes the world or spawns/emits/destroys: ${world}; writes entity fields only: ${entity}; other effects only: ${other}; reads and calls only: ${pure}`);
console.log("effect verbs (lambdas carrying each):", Object.fromEntries([...verbs].sort((a, b) => b[1] - a[1])));
console.log("world places written (lambdas):", Object.fromEntries([...sharedPlaces].sort((a, b) => b[1] - a[1])));
