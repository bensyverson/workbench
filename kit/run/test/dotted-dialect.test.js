// Probe: a Dialect whose name holds a dot (defineDialect accepts any non-empty string) makes every key-changing
// rebuild fail the re-plan with S251, because kit/compose/replan.js recovers a conversion's frame from its printed
// name ("<dialect>.<frame>") by splitting at the first dot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { defineDialect, defineRuntime, struct } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { mazeDecl, mazeGrammar } from "../../define/fixtures/seams-dialects.js";
import { fxKit, mazeStep, RELEASED, CORRIDOR, STEER, SPAWN } from "./helpers.js";

function mazeKitNamed(/** @type {string} */ name) {
  const decl = /** @type {any} */ (mazeDecl());
  decl.name = name;
  decl.state.pad = struct({ up: "bool", down: "bool", left: "bool", right: "bool" });
  decl.ports.in = { pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "the pad" } };
  const grammar = mazeGrammar(defineDialect(decl));
  const runtime = defineRuntime(grammar, {
    clock: (/** @type {any} */ r) => ({ tick: r.tick ?? 1 / 8 }),
    init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, pad: RELEASED }),
    step: /** @type {any} */ (mazeStep),
    events: { in: { pad: 120 }, out: { picked: 8 } },
  });
  return { grammar, runtime };
}

const LONG = ["#########", "#..cc.cc#", "#########"];

for (const name of ["maze", "acme.maze"]) {
  test(`Dialect named '${name}': a rebuild that moves a fit edge re-plans`, () => {
    const M = mazeKitNamed(name), F = fxKit({ clock: { tick: 1 / 4 }, max: 16 });
    const l = /** @type {any} */ (M.grammar("level").grid(CORRIDOR).control(STEER));
    const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn(SPAWN));
    const runtimes = [M.runtime, F.runtime];
    const composed = compose("fit-bursts").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst).build({ runtimes });
    const long = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
    const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.2, part: "level", record: long }] });
    run.runUntil(1);
    assert.equal(run.builds[0].ok, true, JSON.stringify(run.builds[0].diagnostics));
  });
}
