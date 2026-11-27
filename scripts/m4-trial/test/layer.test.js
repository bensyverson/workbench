// The layer dogfood's checker (leaf teBNYM): a glue written against kit/compose's layer draft, judged by the draft's
// rules and played with the shown layer's bottom producer, on the M4 trial's recorded game and score hand-ins. The
// draft's own rewrite of the M4 glue (kit/compose/README.md, "Layers (draft)") is the clean case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayerCompose } from "../checker/layer-leg.js";

const here = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const RUNS = here("../runs/2026-11-26");
const GIVEN = [join(RUNS, "game-run1/gemgrid"), join(RUNS, "score/scoretimer")];

const HEAD = `import { compose, page, layer } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";
`;
const LEVEL = `  const level = gemgrid("level").map(["############", "############", "#P..*....*.#", "#.##.##.##.#", "#.*......*.#", "#.##.##.##.#", "#.*..*...*.#", "############"]);
  const round = scoretimer("round").label("GEM RUSH").lasts(30);
`;
const FRAME = `    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 4] })\n`;
const WIRES = `    .wire(page.out.pad, level.in.pad)\n    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })\n`;

/** A glue with the given lines between the two parts and the end. @param {string} middle @param {{ frame?: boolean, before?: string }} [o] */
const glue = (middle, o = {}) => `${HEAD}\nexport default () => {\n${LEVEL}${o.before ?? ""}  return compose("timed-gems")\n    .part(level).part(round)\n${o.frame === false ? "" : FRAME}${WIRES}${middle};\n};\n`;

/** A leg folder holding the two given packages and this glue. @param {string} text @param {string[]} [extra] */
function leg(text, extra = []) {
  const d = mkdtempSync(join(tmpdir(), "teBNYM-test-"));
  for (const g of [...GIVEN, ...extra]) cpSync(g, join(d, g.split("/").pop() ?? ""), { recursive: true });
  writeFileSync(join(d, "workbench.js"), text);
  return d;
}
/** @param {string} text @param {string[]} [extra] */
const check = (text, extra) => checkLayerCompose(leg(text, extra), GIVEN);
/** @param {Awaited<ReturnType<typeof checkLayerCompose>>} r */
const codes = (r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

test("the draft's rewrite of the M4 glue checks clean: the shorthand's layer is Draw<72> (67 + 5, the built maxes) in the level's px, its box the level's 192 by 128", async () => {
  const r = await check(glue("    .show(level.out.view, round.out.view)"));
  assert.deepEqual(codes(r), [], JSON.stringify(r.diagnostics, null, 1));
  assert.ok(r.notes.includes("layer layers: Draw<72>@level.px, page box 192 by 128"), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => /round\.out\.view → layers\.in\.1: round\.panel → level\.px, draw, \{ scale: 1, offset: \[16, 4\] \}/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => /level\.out\.view → layers\.in\.0: unchanged/.test(n)));
});

test("a named layer, shown, checks clean", async () => {
  const r = await check(glue("    .show(screen)", { before: `  const screen = layer("screen", level.out.view, round.out.view);\n` }));
  assert.deepEqual(codes(r), [], JSON.stringify(r.diagnostics, null, 1));
  assert.ok(r.notes.some((n) => n.startsWith("layer screen: Draw<72>")));
});

test("a package of the composer's own beside the two is T030 (layering is built in), while the given two still count", async () => {
  const r = await check(glue("    .show(level.out.view, round.out.view)"), [join(RUNS, "compose/overlay")]);
  assert.deepEqual(codes(r), ["T030"]);
});

test("one output shown alone, a one-input layer, an output twice and a non-Draw output are refused (S102, S404)", async () => {
  assert.deepEqual(codes(await check(glue("    .show(level.out.view)"))), ["S102"]);
  assert.ok(codes(await check(glue("    .show(screen)", { before: `  const screen = layer("screen", level.out.view);\n` }))).includes("S102"));
  assert.ok(codes(await check(glue("    .show(level.out.view, level.out.view)"))).includes("S102"));
  assert.ok(codes(await check(glue("    .show(level.out.view, level.out.picked)"))).includes("S404"));
});

test("a layer whose top input's frame has no path to the bottom's is S251", async () => {
  const r = await check(glue("    .show(level.out.view, round.out.view)", { frame: false }));
  assert.deepEqual(codes(r), ["S251"]);
  assert.match(r.diagnostics[0].fix, /\.frame\(<round\.frame\.panel>, <level\.frame\.px>/);
});

test("the score under the game is T033 (painter's order), and a handle a layer lacks is S111", async () => {
  assert.deepEqual(codes(await check(glue("    .show(round.out.view, level.out.view)"))), ["T033"]);
  assert.deepEqual(codes(await check(glue("    .wire(level.out.view, screen.in.under)\n    .show(screen)", { before: `  const screen = layer("screen", level.out.view, round.out.view);\n` }))), ["S111"]);
});

test("the shorthand beside a part named layers is S101, and a copied ceiling is a T031 warning", async () => {
  const named = glue("    .show(level.out.view, round.out.view)").replace(`scoretimer("round")`, `scoretimer("layers")`);
  assert.ok(codes(await check(named)).includes("S101"));
  const r = await check(glue("    .show(level.out.view, round.out.view)", { before: "  const CEILING = 302;\n" }));
  assert.ok(r.diagnostics.some((d) => d.code === "T031" && d.severity === "warning" && /302/.test(d.message)));
});

test("check.js takes --role layer, and run.sh layer needs the two leg folders", () => {
  const d = leg(glue("    .show(level.out.view)"));
  const r = spawnSync(process.execPath, [here("../check.js"), d, "--role", "layer", "--given", GIVEN[0], "--given", GIVEN[1]], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /S102 \(draft\)/);
  assert.equal(spawnSync("sh", [here("../run.sh"), "layer", "/private/tmp/teBNYM-x", "sonnet"], { encoding: "utf8" }).status, 2);
});

test("a real kit diagnostic about a forwarded call names the glue's line, not the stand-in's (layer legs 2 and 3 saw S206 at layer-draft.js:117)", async () => {
  const text = glue("    .show(level.out.view, round.out.view)").replace(", { set: { points: 1 } }", "");
  const r = await check(text);
  const d = r.diagnostics.find((x) => x.code === "S206");
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.equal(d.file, "workbench.js");
  assert.equal(d.line, text.split("\n").findIndex((l) => l.includes(".wire(level.out.picked")) + 1);
});

test("the three recorded layer legs (2026-11-27) check clean on the two author hand-ins they were given", async () => {
  for (const n of [1, 2, 3]) {
    const r = await checkLayerCompose(here(`../runs/2026-11-27-layer/leg${n}`), GIVEN);
    assert.deepEqual(codes(r), [], `leg ${n}: ${JSON.stringify(r.diagnostics)}`);
  }
});
