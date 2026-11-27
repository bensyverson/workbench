// The layer leg's checker (leaf teBNYM; on the real kit since layer-build, leaf pQKgWN): a glue that layers the M4
// trial's recorded game and score hand-ins with kit/compose's built-in layer, loaded, built and played on the page as
// the host does it. kit/compose/README.md's own rewrite of the M4 glue ("Layers") is the clean case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayerCompose } from "../checker/layer-leg.js";
import { readPackageDir } from "../../pkg/dir.js";
import { loadWorkbench } from "../../../kit/page/host/load.js";
import { createRun, pageView } from "../../../kit/run/index.js";
import { ENV } from "../checker/env.js";

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

test("the README's rewrite of the M4 glue checks clean and plays: the shorthand's layer is Draw<72> (67 + 5, the built maxes) in the level's px, its box the level's 192 by 128", async () => {
  const r = await check(glue("    .show(level.out.view, round.out.view)"));
  assert.deepEqual(codes(r), [], JSON.stringify(r.diagnostics, null, 1));
  assert.ok(r.notes.includes("layer layers: Draw<72>@level.px, page box 192 by 128"), r.notes.join("\n"));
  assert.ok(r.notes.includes("  round.out.view → layers.in.1: (value): scoretimer.panel → gemgrid.px, draw, ×1 +[16, 4]"), r.notes.join("\n"));
  assert.ok(r.notes.includes("  level.out.view → layers.in.0: unchanged"), r.notes.join("\n"));
});

test("the layer draws on the real kit: the level's ops, then the panel's, converted into the level's px", async () => {
  const d = leg(glue("    .show(level.out.view, round.out.view)"));
  const w = await loadWorkbench({ packages: { gemgrid: readPackageDir(join(d, "gemgrid")), scoretimer: readPackageDir(join(d, "scoretimer")) }, glue: { path: "workbench.js", text: glue("    .show(level.out.view, round.out.view)") } }, ENV);
  assert.ok(w.composed, JSON.stringify(w.diagnostics));
  const run = createRun(w.composed, { runtimes: w.runtimes });
  const v = pageView(run, w.composed, w.runtimes);
  const under = /** @type {any[]} */ (run.snapshot("level").draws?.view), over = /** @type {any[]} */ (run.snapshot("round").draws?.view);
  assert.equal(v.part, "layers");
  assert.deepEqual(v.box, { min: [0, 0], max: [192, 128] });
  assert.equal(v.list.length, under.length + over.length);
  assert.deepEqual(v.list.slice(0, under.length), under, "the level, unchanged, at the bottom");
  const text = /** @type {any} */ (v.list.slice(under.length).find((op) => op.op === "text")), own = over.find((op) => op.op === "text");
  assert.deepEqual(text.at, [own.at[0] + 16, own.at[1] + 4], "the panel's text moved by the .frame edge, never scaled");
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

test("the kit's refusals reach the leg: one output shown alone, a one-input layer, an output twice, a non-Draw output (S102, S404)", async () => {
  assert.deepEqual(codes(await check(glue("    .show(level.out.view)"))), ["S102"]);
  assert.ok(codes(await check(glue("    .show(screen)", { before: `  const screen = layer("screen", level.out.view);\n` }))).includes("S102"));
  assert.ok(codes(await check(glue("    .show(level.out.view, level.out.view)"))).includes("S102"));
  assert.ok(codes(await check(glue("    .show(level.out.view, level.out.picked)"))).includes("S404"));
});

test("a layer whose top input's frame has no path to the bottom's is S251", async () => {
  const r = await check(glue("    .show(level.out.view, round.out.view)", { frame: false }));
  assert.deepEqual(codes(r), ["S251"]);
  assert.match(r.diagnostics[0].fix, /\.frame\(round\.frame\.panel, level\.frame\.px/);
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
  assert.match(r.stdout, /S102 \.show\(level\.out\.view\)/);
  assert.equal(spawnSync("sh", [here("../run.sh"), "layer", "/private/tmp/teBNYM-x", "sonnet"], { encoding: "utf8" }).status, 2);
});

test("a kit diagnostic names the glue's line (layer legs 2 and 3 saw S206 at the stand-in's own line, layer-draft.js:117)", async () => {
  const text = glue("    .show(level.out.view, round.out.view)").replace(", { set: { points: 1 } }", "");
  const r = await check(text);
  const d = r.diagnostics.find((x) => x.code === "S206");
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.equal(d.file, "workbench.js");
  assert.equal(d.line, text.split("\n").findIndex((l) => l.includes(".wire(level.out.picked")) + 1);
});

test("the three recorded layer legs (2026-11-27) build and play on the real kit: Draw<72>, Draw<72> and Draw<82>, as the findings say", async () => {
  for (const [n, max, box] of /** @type {const} */ ([[1, 72, "192 by 128"], [2, 72, "192 by 128"], [3, 82, "192 by 144"]])) {
    const r = await checkLayerCompose(here(`../runs/2026-11-27-layer/leg${n}`), GIVEN);
    assert.deepEqual(codes(r), [], `leg ${n}: ${JSON.stringify(r.diagnostics)}`);
    assert.ok(r.notes.some((x) => x.startsWith(`layer layers: Draw<${max}>@`) && x.endsWith(`page box ${box}`)), `leg ${n}: ${r.notes.join("\n")}`);
  }
});

const KIT = here("../../../kit");
/** A leg's doc copy of the kit (the three files layer-docs.js reads), edited by layer-docs.js. @param {(compose: string) => string} [edit] */
function docCopy(edit = (t) => t) {
  const d = mkdtempSync(join(tmpdir(), "KYpY7Q-docs-"));
  mkdirSync(join(d, "compose"));
  for (const f of ["START.md", "API.md"]) cpSync(join(KIT, f), join(d, f));
  writeFileSync(join(d, "compose/README.md"), edit(readFileSync(join(KIT, "compose/README.md"), "utf8")));
  return d;
}

test("layer-docs.js gives a leg the kit's docs as they are, minus the compose README's rewrite of this task's glue", () => {
  const d = docCopy();
  const r = spawnSync(process.execPath, [here("../layer-docs.js"), d], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const compose = readFileSync(join(d, "compose/README.md"), "utf8");
  assert.ok(!compose.includes("The M4 trial's glue"), "the subsection is gone");
  assert.ok(!compose.includes("level.out.picked, round.in.scored"), "none of its code is left");
  assert.ok(compose.includes("## Layers") && compose.includes("### Codes"), "the rest of the section stays");
  for (const f of ["START.md", "API.md"]) assert.equal(readFileSync(join(d, f), "utf8"), readFileSync(join(KIT, f), "utf8"), `${f} is the kit's own`);
});

test("layer-docs.js also drops the anchored-edge draft's HUD subsection, and nothing in the copy names the trial's parts or offset (leaf JBkhsf)", () => {
  const d = docCopy();
  const r = spawnSync(process.execPath, [here("../layer-docs.js"), d], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const compose = readFileSync(join(d, "compose/README.md"), "utf8");
  assert.ok(!compose.includes("### The M4 trial's HUD, anchored"), "the HUD subsection is gone");
  for (const answer of ["[16, 4]", "[16, 104]", "192 − 160", "round.frame.panel", "scoretimer.panel", "gemgrid.px"]) assert.ok(!compose.includes(answer), `the copy has no ${answer}`);
  assert.ok(compose.includes("## Draft: an anchored edge") && compose.includes("### Beyond the HUD"), "the rest of the draft stays");
});

test("layer-docs.js exits 1 when the anchored draft's HUD subsection is not there, so a renamed heading stops the leg", () => {
  const d = docCopy((t) => t.replace("### The M4 trial's HUD, anchored", "### Something else"));
  const r = spawnSync(process.execPath, [here("../layer-docs.js"), d], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /M4 trial's HUD, anchored/);
});

test("layer-docs.js exits 1 when the subsection to strip is not there, so a changed doc stops the leg", () => {
  const d = docCopy((t) => t.replace("### The M4 trial's glue, with a layer", "### Something else"));
  const r = spawnSync(process.execPath, [here("../layer-docs.js"), d], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /M4 trial's glue, with a layer/);
});

test("the two recorded rerun legs (2026-11-27, leaf KYpY7Q: Sonnet, Haiku) build and play on the real kit: Draw<72> and Draw<74>, page box 192 by 128", async () => {
  for (const [leg, max] of [["sonnet", 72], ["haiku", 74]]) {
    const r = await checkLayerCompose(here(`../runs/2026-11-27-layer-rerun/${leg}`), GIVEN);
    assert.deepEqual(codes(r), [], `${leg}: ${JSON.stringify(r.diagnostics)}`);
    assert.ok(r.notes.some((x) => x.startsWith(`layer layers: Draw<${max}>@`) && x.endsWith("page box 192 by 128")), `${leg}: ${r.notes.join("\n")}`);
  }
});
