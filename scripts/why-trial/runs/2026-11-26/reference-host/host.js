// The host: builds Glowworm Deep, runs it, and keeps the cave's depth in step with the game's. A part's params come
// only from outside the run (a `param` input), so the host reads the game's depth after each chunk of the run and,
// when it moved, sets the cave's `depth` param; the cave reads it at build time, so the run rebuilds the cave.

import { run as runProgram } from "kit/define";
import { createRun } from "kit/run";
import { caveRuntime } from "./cave.package.js";
import { gameRuntime } from "./game.package.js";
import { caveProgram, gameProgram, glue } from "./glue.js";

const PROGRAMS = /** @type {Record<string, (p: any) => any>} */ ({ cave: caveProgram, game: gameProgram });
export const runtimes = [caveRuntime, gameRuntime];

/** Builds one part from its Program with these params: its record, with the build-time reads. @param {string} part @param {Record<string, unknown>} [values] */
export function buildPart(part, values = {}) {
  const r = runProgram(PROGRAMS[part], { values });
  if (!r.record) throw new Error(`part ${part} did not build: ${JSON.stringify(r.diagnostics)}`);
  return /** @type {Record<string, any>} */ (r.record);
}

/** The composed record, each part's record built from its Program (so the cave's carries what it read at build). */
export function buildComposition() {
  const defaults = { seed: 7, depth: 0, roughness: 45 };
  const composed = glue(caveProgram(defaults), gameProgram({})).build({ runtimes });
  return { ...composed, parts: composed.parts.map((p) => ({ ...p, record: buildPart(p.name) })) };
}

/**
 * Plays a session: the scripted pad inputs in the log, the run advanced in chunks of `chunk` seconds (the host's
 * loop), and after each chunk: the person's actions that came due (a slider moved: `{ T, slider: name, value }`
 * sets a cave param; `{ T, save: true }`, the editor saved the glue, rebuilds the cave from its Program), then the
 * cave's depth set to the game's when it moved. Each is stamped at the run's next instant.
 * @param {{ inputs?: any[], actions?: any[], chunk?: { n: number, d: number }, until?: number }} [o]
 */
export function play(o = {}) {
  const chunk = o.chunk ?? { n: 1, d: 10 };
  const run = createRun(buildComposition(), { runtimes, build: buildPart, inputs: o.inputs ?? [] });
  /** @type {Record<string, unknown>} */
  const caveParams = { depth: 0 };
  const actions = [...(o.actions ?? [])];
  const end = Math.round((o.until ?? 1.5) * chunk.d / chunk.n);
  const forward = () => {
    const depth = /** @type {any} */ (run.state("game")).depth;
    if (depth !== caveParams.depth) {
      run.input({ kind: "param", part: "cave", name: "depth", value: depth });
      caveParams.depth = depth;
    }
  };
  for (let k = 1; k <= end; k++) {
    const target = { n: k * chunk.n, d: chunk.d };
    for (let T = run.nextInstant(); T && T.n * target.d <= target.n * T.d; T = run.nextInstant()) { run.step(); forward(); }
    run.runUntil(target);
    while (actions.length && actions[0].T <= run.seconds) {
      const a = actions.shift();
      if (a.save) run.input({ kind: "rebuild", part: "cave", record: buildPart("cave", caveParams), trigger: { kind: "glue", call: null } });
      else { run.input({ kind: "param", part: "cave", name: a.slider, value: a.value }); caveParams[a.slider] = a.value; }
    }
    const depth = /** @type {any} */ (run.state("game")).depth;
    if (depth !== caveParams.depth) {
      run.input({ kind: "param", part: "cave", name: "depth", value: depth });
      caveParams.depth = depth;
    }
  }
  return run;
}
