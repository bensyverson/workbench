// Checks across parts once the program is built: every output handle names an output (S311), every
// .sample() is valid (S321), and the task's five seams are present (G001–G005).

import { didYouMean } from "../../../kit/lower/codes.js";
import { session } from "./session.js";
import { unwrap, OutHandle, isPoison } from "./handles.js";
import { TilesPart } from "./stubs/tiles.js";
import { GlowPart } from "./stubs/glow.js";
import { CavePart } from "./stubs/cave.js";

/** @import { Reads } from "./lambdas.js" */
/** @import { LambdaRec } from "./session.js" */

export const SAMPLE_MODES = ["latest", "lerp"];

export function crossCheck() {
  for (const h of session.handles) {
    if (h.type) continue;
    const names = [...h.part.outputs().keys()];
    session.add("S311", h.site, `${h.part.label} has no output '${h.name}'; its outputs are ${names.join(", ")}.${didYouMean(h.name, names)}`, h.part.dialect === "tiles" ? `use a declared output, or add it: .export("${h.name}", "<type>", w => …) on ${h.part.label}` : `use one of ${names.join(", ")}`);
  }
  for (const p of session.parts) {
    for (const s of p.samples) {
      const h = unwrap(s.handle);
      if (!(h instanceof OutHandle)) { if (!isPoison(s.handle)) session.add("D002", s.site, `.sample() takes another part's output and a mode; got ${typeof s.handle}.`, '.sample(game.out.player, "lerp")'); continue; }
      const t = h.type;
      if (!t) continue;
      if (typeof s.mode !== "string" || !SAMPLE_MODES.includes(s.mode)) session.add("S321", s.site, `.sample(${h.text}, ${JSON.stringify(s.mode)}): the mode must be "latest" or "lerp".`, `.sample(${h.text}, "lerp")`);
      else if (h.part === p) session.add("S321", s.site, `${p.label} samples its own output ${h.text}.`, "remove the .sample() call");
      else if (s.mode === "lerp" && !t.numeric) session.add("S321", s.site, `"lerp" needs a numeric or vector signal; ${h.text} is ${t.text}.`, `.sample(${h.text}, "latest"), or remove the call`);
    }
  }
}

const TASK = { file: "program.js", line: 1 };

/** @param {Map<LambdaRec, Reads>} reads */
export function goals(reads) {
  const recs = [...reads.entries()];
  /** @param {LambdaRec} r */
  const partOf = (r) => r.part ?? r.actor?.part ?? null;
  const tilesParts = session.parts.filter((p) => p instanceof TilesPart).map((p) => /** @type {TilesPart} */ (p));
  /** @param {TilesPart} t */
  const mapSource = (t) => (t.map?.source instanceof OutHandle ? t.map.source : null);

  const g1 = tilesParts.some((t) => {
    const src = mapSource(t);
    return src && src.part instanceof CavePart && src.name === "cells" && recs.some(([r, x]) => partOf(r) === t && x.convertsCell);
  });
  if (!g1) session.add("G001", TASK, "no cave → tiles value seam with a frame conversion: a tiles part's .map() must take a cave's out.cells, and a tiles lambda must convert a cave cell position with tile().", 'for example .spawn(Hero, level.out.spawns, { kind: "start", init: s => ({ pos: tile(s.at) }) })');

  const g2 = session.parts.some((g) => {
    if (!(g instanceof GlowPart) || !g.over) return false;
    const img = g.over.handle;
    return img.part instanceof TilesPart && img.name === "image" && recs.some(([r, x]) => r.part === g && r.slot === "glow.light" && x.outs.some((o) => o.part === img.part && o.name !== "image"));
  });
  if (!g2) session.add("G002", TASK, "no tiles → glow per-frame signal: a glow part must be .over() a tiles part's out.image, and its .light() must read one of that part's exported outputs.", "for example distance(p.xy, game.out.player) inside .light(p => …)");

  const g3 = session.parts.some((c) => c instanceof CavePart && recs.some(([r, x]) => r.part === c && r.slot === "cave.seed" && x.outs.some((o) => o.part instanceof TilesPart && mapSource(o.part)?.part === c)));
  if (!g3) session.add("G003", TASK, "no cross-part cycle: a cave's .seed() must be a lambda that reads an output of the tiles part whose .map() takes that cave's cells.", ".seed(() => $.seed + game.out.depth)");

  /** @param {(r: LambdaRec) => boolean} pick */
  const helpers = (pick) => new Set(recs.filter(([r]) => pick(r)).flatMap(([, x]) => [...x.helpers]));
  const cpu = helpers((r) => partOf(r)?.target === "cpu");
  const gpu = helpers((r) => partOf(r)?.target === "gpu");
  if (![...cpu].some((h) => gpu.has(h))) session.add("G004", TASK, `no lib/ helper is called both on the CPU (cave or tiles lambdas: ${[...cpu].join(", ") || "none"}) and on the GPU (glow lambdas: ${[...gpu].join(", ") || "none"}).`, "call one lib/ helper from a cave or tiles lambda and from the glow lambda");

  const inKernels = new Set(recs.flatMap(([, x]) => [...x.params]));
  if (![...session.buildParamReads].some((p) => inKernels.has(p))) session.add("G005", TASK, `no parameter is read both at build time (${[...session.buildParamReads].join(", ") || "none"}) and as $.name in a runtime lambda (${[...inKernels].join(", ") || "none"}).`, "read one parameter in build-time code (such as a count) and inside a lambda");
}
