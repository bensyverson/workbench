// Lists every runtime lambda in all DMG presets: the corpus the M1 parser is built
// against. Run `npm run inventory` to write scripts/dmg-oracle/out/inventory.json
// and print one row per preset.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDmg } from "./load.js";
import { lambdaSlots } from "./lambdas.js";
import { topLevelNames, topLevelRefs } from "./toplevel.js";

/**
 * @typedef {object} InventoryEntry
 * @property {string} preset
 * @property {string} id
 * @property {import("./lambdas.js").SlotKind} kind
 * @property {string} owner
 * @property {string[]} usedBy
 * @property {string} src
 * @property {string[]} topLevelRefs  Top-level bindings of the preset program (helpers, constants) the lambda uses; empty when it is self-contained.
 */

/**
 * Every runtime lambda in every preset, in preset order.
 * @param {ReturnType<typeof loadDmg>} [dmg]
 * @returns {InventoryEntry[]}
 */
export function inventory(dmg = loadDmg()) {
  return dmg.presets.flatMap((p) => {
    const names = topLevelNames(p.code);
    return lambdaSlots(dmg.build(p.id).spec).map((s) => ({ preset: p.id, id: s.id, kind: s.kind, owner: s.owner, usedBy: s.usedBy, src: s.src, topLevelRefs: topLevelRefs(s.src, names) }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dmg = loadDmg();
  const inv = inventory(dmg);
  const outDir = fileURLToPath(new URL("./out/", import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const outFile = `${outDir}inventory.json`;
  writeFileSync(outFile, JSON.stringify(inv, null, 2) + "\n");
  for (const p of dmg.presets) {
    const mine = inv.filter((e) => e.preset === p.id);
    /** @type {Record<string, number>} */
    const kinds = {};
    for (const e of mine) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    console.log(`${p.id}  ${String(mine.length).padStart(3)}  ${p.title.padEnd(28)}  ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  }
  const open = inv.filter((e) => e.topLevelRefs.length > 0).length;
  console.log(`total ${inv.length} runtime lambdas in ${dmg.presets.length} presets, ${open} using top-level bindings → ${outFile}`);
}
