// Glowworm Deep with the double descent fixed (leaf YV7ZNG): the game's depth is wired into the cave's depth param,
// so the run itself sets the param between instants, and the host no longer bridges the two. Not part of the
// trial's packet (packet.js copies its own list of files).

import { compose } from "../../../kit/compose/index.js";
import { createRun } from "../../../kit/run/index.js";
import { caveProgram, gameProgram } from "./glue.js";
import { runtimes, buildPart } from "./host.js";

/** The glue, as glue.js's, with the param wire. @param {any} level @param {any} play */
export const wiredGlue = (level, play) => compose("glowworm-deep")
  .part(level).part(play)
  .frame(level.frame.cell, play.frame.cell, { scale: 1, offset: 0 })
  .wire(level.out.start, play.in.start)
  .wire(level.out.exit, play.in.exit)
  .wire(play.out.depth, level.param.depth)
  .show(play);

/** The composed record, each part's record built from its Program (so the cave's carries what it read at build). */
export function buildWired() {
  const composed = wiredGlue(caveProgram({ seed: 7, depth: 0, roughness: 45 }), gameProgram({})).build({ runtimes });
  return { ...composed, parts: composed.parts.map((p) => ({ ...p, record: buildPart(p.name) })) };
}

/**
 * Plays a session as host.js's play does, minus the depth bridge: the run advanced `chunk` seconds at a time, and
 * after each chunk the slider moves that came due (`{ T, slider, value }`), each a param input at the next instant.
 * @param {{ inputs?: any[], actions?: Array<{ T: number, slider: string, value: unknown }>, chunk?: { n: number, d: number }, until?: number }} [o]
 */
export function playWired(o = {}) {
  const chunk = o.chunk ?? { n: 1, d: 10 };
  const run = createRun(buildWired(), { runtimes, build: buildPart, inputs: o.inputs ?? [] });
  const actions = [...(o.actions ?? [])];
  const end = Math.round((o.until ?? 1.5) * chunk.d / chunk.n);
  for (let k = 1; k <= end; k++) {
    run.runUntil({ n: k * chunk.n, d: chunk.d });
    while (actions.length && actions[0].T <= run.seconds) {
      const a = /** @type {{ slider: string, value: unknown }} */ (actions.shift());
      run.input({ kind: "param", part: "cave", name: a.slider, value: a.value });
    }
  }
  return run;
}
