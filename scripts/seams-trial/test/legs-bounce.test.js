// The second pairing's checker (leaf UTdvE6): bounce (balls that meet walls) into swarm (agents a record draws).
// The reference hand-ins (fixtures/valid-3, written from docs-placeholder/) pass; each rule refuses a copy broken in
// exactly that way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLeg } from "../checker/legs.js";
import { stateProblems2, traitProblems, atWall, gathered } from "../checker/legs-bounce.js";
import { handIn, remove, sub, FIXTURES_3 } from "../fixture-copy.js";

/** The codes a broken copy of the reference hand-in gets. @param {"bounce" | "swarm" | "compose"} role @param {(d: string) => void} [edit] */
async function codes(role, edit) {
  const dir = await handIn(role, edit, { from: FIXTURES_3 });
  try {
    const r = await checkLeg(dir, role);
    return { codes: r.diagnostics.map((d) => d.code), r };
  } finally { remove(dir); }
}

test("the reference bounce hand-in passes: both examples push wall records at a wall", async () => {
  const { r } = await codes("bounce");
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.notes.some((n) => /^examples\/01\.js: \d+ wall records in 4 s; the first at T = [\d.]+: \{"contact":\[/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => /^examples\/02\.js: \d+ wall records/.test(n)), r.notes.join("\n"));
});

test("the reference swarm hand-in passes: a probe record on lure draws agents to it", async () => {
  const { r } = await codes("swarm");
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.notes.some((n) => /^examples\/03\.js: a lure record at \(100, 75\) at T = 0\.5: \d+ more agents within 25 of it than without, at T = [\d.]+$/.test(n)), r.notes.join("\n"));
});

test("the reference composition passes: planned with a rename and an overflow policy, run to a gathering, replayed", async () => {
  const { r } = await codes("compose");
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.plan, ["table.out.wall → gnats.in.lure: spot: bounce.box → swarm.ground, point, ×2 +0 (fit at line 28: [0, 0]..[160, 120] in [0, 0]..[320, 240]); drops speed; fills pull = 1; overflow keepLast"]);
  assert.ok(r.notes.some((n) => /^run: \d+ wall records by T = 8; the first at T = [\d.]+/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => /^run: \d+ more agents within 40 of \([\d., ]+\) in swarm\.ground than without, at T = [\d.]+, [\d.]+ s after its record$/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.includes("run: replayed, same state hashes at every instant"), r.notes.join("\n"));
  // a warning keeps the kit's fix, as a violation's does
  assert.ok(r.notes.some((n) => /^workbench\.js:\d+: S116 \(warning\) .*\n  fix: /.test(n)), r.notes.join("\n"));
});

test("without its overflow policy the reference composition is S116: 128 records a tick into a max of 8", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", ', overflow: "keepLast"', ""); });
  assert.deepEqual(c, ["S116"]);
});

test("G001 to G003 hold for the new roles: a starting package has no runtime", async () => {
  const { codes: c } = await codes("swarm", (d) => {
    sub(d, "wb-package.json", '"version": "0.2.0"', '"version": "0.1.0"');
    sub(d, "wb-package.json", ',\n    "runtime": "swarm.runtime.js"', "");
  });
  assert.ok(c.includes("G001") && c.includes("G002"), c.join(" "));
});

test("G004: a bounce package with no Event output, a swarm package with no Event input", async () => {
  const { codes: b } = await codes("bounce", (d) => {
    sub(d, "bounce.dialect.js", 'wall: { seam: "Event<{ contact: point2@box, speed: f64@box/s }>"', 'wall: { seam: "f64", from: "rebounds"');
    sub(d, "bounce.runtime.js", "events.wall.push({ contact, speed: Math.hypot(b.vx, b.vy) });", "");
    sub(d, "bounce.runtime.js", "  events: { out: { wall: 2 * MAX_BALLS } },\n", "");
  });
  assert.ok(b.includes("G004"), b.join(" "));
  const { codes: s, r } = await codes("swarm", (d) => { sub(d, "swarm.dialect.js", 'seam: "Event<{ spot: point2@ground, pull: f64 = 1 }>"', 'seam: "Event<{ pull: f64 = 1 }>"'); });
  assert.ok(s.includes("G004"), s.join(" "));
  assert.match(r.diagnostics.find((x) => x.code === "G004")?.message ?? "", /point field/);
});

test("the probe leaves a defaulted field to the wire: a swarm that answers only records carrying its default passes", async () => {
  const { codes: c } = await codes("swarm", (d) => {
    sub(d, "swarm.dialect.js", "pull: f64 = 1 }>", "pull: f64 = 1.5 }>");
    sub(d, "swarm.runtime.js", "const calls = inputs.lure;", "const calls = inputs.lure.filter((c) => c.pull === 1.5);");
  });
  assert.deepEqual(c, []);
});

test("G014: a bounce runtime that pushes no record", async () => {
  const { codes: c } = await codes("bounce", (d) => { sub(d, "bounce.runtime.js", "events.wall.push({ contact, speed: Math.hypot(b.vx, b.vy) });", ""); });
  assert.deepEqual(c, ["G014"]);
});

test("G015: a bounce runtime that pushes the box's middle, not the wall", async () => {
  const { codes: c, r } = await codes("bounce", (d) => { sub(d, "bounce.runtime.js", "events.wall.push({ contact,", "events.wall.push({ contact: [w / 2, h / 2],"); });
  assert.deepEqual(c, ["G015"]);
  assert.match(r.diagnostics[0].message, /\(80, 60\)/);
});

test("G016: a swarm runtime that ignores its lure", async () => {
  const { codes: c } = await codes("swarm", (d) => { sub(d, "swarm.runtime.js", "const calls = inputs.lure;", "const calls = inputs.lure.filter(() => false);"); });
  assert.deepEqual(c, ["G016"]);
});

test("G017: a swarm that keeps no traits in its state (the old workaround) is refused; the kit alone does not see it", async () => {
  const { codes: c, r } = await codes("swarm", (d) => {
    sub(d, "swarm.dialect.js", ", group: \"str\", traits: struct({}, { extensible: true }) }), 2000)", ", group: \"str\" }), 2000)");
    sub(d, "swarm.dialect.js", "}, state };", "} };");
    sub(d, "swarm.runtime.js", ", group, traits: { ...traits } });", ", group });");
    sub(d, "swarm.runtime.js", "...q.traits };", "...traits0(record) };");
    sub(d, "swarm.runtime.js", ", group: q.group, traits: Object.fromEntries(names.map((n) => [n, a[n]])) };", ", group: q.group };");
    sub(d, "swarm.runtime.js", "const HOLD = 3;", "const HOLD = 3;\nconst traits0 = (record) => Object.fromEntries(Object.entries(record.traits ?? {}).map(([n, t]) => [n, t.value]));");
  });
  assert.ok(c.length > 0 && c.every((x) => x === "G017"), c.join(" "));
  assert.match(r.diagnostics[0].message, /energy/);
});

test("N codes: a trait written outside what the Program declares is N003 at the runtime", async () => {
  const { codes: c } = await codes("swarm", (d) => { sub(d, "swarm.runtime.js", "traits: Object.fromEntries(names.map((n) => [n, a[n]])) };", "traits: { ...Object.fromEntries(names.map((n) => [n, a[n]])), extra: 1 } };"); });
  assert.ok(c.includes("N003"), c.join(" "));
});

test("G020: no wire from the bounce part to the swarm", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", '    .wire(table.out.wall, gnats.in.lure, { rename: { contact: "spot" }, overflow: "keepLast" })\n', ""); });
  assert.deepEqual(c, ["G020"]);
});

test("G021: a glue that shows the box", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", ".show(gnats)", ".show(table)"); });
  assert.deepEqual(c, ["G021"]);
});

test("G022: a glue whose balls never meet a wall", async () => {
  const { codes: c } = await codes("compose", (d) => {
    sub(d, "workbench.js", '.ball("cue", { x: 40, y: 40, vx: 55, vy: 30, r: 5 })', '.ball("cue", { x: 40, y: 40, vx: 0, vy: 0, r: 5 })');
    sub(d, "workbench.js", '.ball("eight", { x: 120, y: 80, vx: -35, vy: -45, r: 6 })', '.ball("eight", { x: 120, y: 80, vx: 0, vy: 0, r: 6 })');
  });
  assert.deepEqual(c, ["G022"]);
});

test("G023: a glue whose frame edge puts every point off the ground", async () => {
  const { codes: c, r } = await codes("compose", (d) => { sub(d, "workbench.js", '.frame(table.frame.box, gnats.frame.ground, "fit")', ".frame(table.frame.box, gnats.frame.ground, { scale: 2, offset: 5000 })"); });
  assert.deepEqual(c, ["G023"]);
  assert.match(r.diagnostics[0].message, /outside the swarm's extent/);
});

test("G005 and G017's readers, and the wall and gather measures", () => {
  assert.deepEqual(stateProblems2({ balls: [{ x: 1, y: 2 }] }, "bounce"), []);
  assert.match(stateProblems2({ balls: [{ at: [1, 2] }] }, "bounce").join(), /x and y/);
  assert.match(stateProblems2({ dots: [] }, "swarm").join(), /agents/);
  assert.deepEqual(traitProblems({ agents: [{ x: 0, y: 0, mood: 1 }, { x: 0, y: 0, own: { mood: 2 } }] }, ["mood"]), []);
  assert.match(traitProblems({ agents: [{ x: 0, y: 0, own: { other: 1 } }] }, ["mood"]).join(), /mood/);
  const box = { min: [0, 0], max: [100, 50] };
  assert.equal(atWall([0, 20], box), true);
  assert.equal(atWall([97, 20], box), true);
  assert.equal(atWall([50, 4], box), true);
  assert.equal(atWall([50, 25], box), false);
  assert.equal(atWall([150, 25], box), false);
  const quiet = { agents: [{ x: 50, y: 50 }, { x: 0, y: 0 }] };
  assert.equal(gathered({ agents: [{ x: 1, y: 1 }, { x: 0, y: 0 }] }, quiet, [0, 0], 5), 1);
  assert.equal(gathered(quiet, quiet, [0, 0], 5), 0);
});
