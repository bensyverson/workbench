// The layer leg's compose check (the layer dogfood, leaf teBNYM; on the real kit since layer-build, leaf pQKgWN): a
// glue that layers the game's picture under the score's with kit/compose's built-in layer and no package of its own.
// The folder is loaded, checked, built and played as the workbench page does it (the compose leg's checks: the kit's
// K, S, N and H codes, then T020–T023 and the play's T011, T025, T026), with the leg's own codes: T030 a package of
// the composer's own, T031 (a warning for review) a number copied from a producer, T032 the shown thing is not a layer
// of both pictures, T033 the score's picture under the game's. Each layer is printed as a note: its seam, page box and
// each input's conversion, as kit/compose planned them.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readPackageDir } from "../../pkg/dir.js";
import { textOf } from "../../../kit/package/index.js";
import { loadWorkbench } from "../../../kit/page/host/load.js";
import { createRun, pageView } from "../../../kit/run/index.js";
import { compilePart } from "../../../kit/run/compile.js";
import { convertText } from "../../../kit/seam/index.js";
import { parseModule, walkNodes } from "../../../kit/parse/module.js";
import { ENV } from "./env.js";
import { CheckTargetError, t, fromHost, done, readPackage, sameFiles, playPadScript } from "./legs.js";

/** @typedef {import("./legs.js").Diagnostic} Diagnostic */

const GLUE = "workbench.js";

/**
 * The layer leg's check.
 * @param {string} dir  the leg folder: workbench.js and the two given package folders, nothing else
 * @param {string[]} given  the two author packages as their legs left them: the game's, then the score's
 * @returns {Promise<import("./legs.js").CheckResult & { notes: string[] }>}
 */
export async function checkLayerCompose(dir, given) {
  if (!existsSync(dir)) throw new CheckTargetError(`${dir} does not exist`);
  const originals = given.map((g) => readPackage(g));
  /** @type {Diagnostic[]} */
  const out = [];
  /** @type {string[]} */
  const notes = [];
  const finish = () => ({ ...done(out), notes });
  /** @type {Record<string, Record<string, string | Uint8Array>>} */
  const packages = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".") && existsSync(join(dir, e.name, "wb-package.json"))) packages[e.name] = readPackageDir(join(dir, e.name));
  }
  const givenNames = given.map((g) => basename(g));
  givenNames.forEach((name, i) => {
    if (!packages[name]) out.push(t("T027", `the package ${name}/ you were given is not in the folder`, `put ${name}/ back as you were given it`, `${name}/wb-package.json`));
    else if (!sameFiles(packages[name], originals[i])) out.push(t("T027", `the package ${name}/ you were given was changed`, `restore ${name}/ as you were given it, and report what it lacked under Gaps`, `${name}/wb-package.json`));
  });
  for (const extra of Object.keys(packages).filter((n) => !givenNames.includes(n))) {
    out.push(t("T030", `${extra}/ is a package of your own; layering is built in, so this task allows no package beside the two you were given`, "delete it and layer the pictures in the glue (docs/kit/compose/README.md, Layers)", `${extra}/wb-package.json`));
    delete packages[extra];
  }
  const gluePath = join(dir, GLUE);
  if (!existsSync(gluePath)) { out.push(t("T020", "there is no workbench.js", "write the glue as workbench.js in your folder", GLUE)); return finish(); }
  const text = readFileSync(gluePath, "utf8");

  const w = await loadWorkbench({ packages, glue: { path: GLUE, text } }, ENV);
  out.push(...w.diagnostics.map((d) => fromHost(d, GLUE)));
  if (!w.composed) { if (!out.some((d) => d.severity === "error")) out.push(t("T020", "the composition did not build", "see the diagnostics above", GLUE)); return finish(); }
  const c = w.composed;
  const runtimes = w.runtimes;
  const loaded = w.packages.map((p) => p.loaded);
  /** @param {string} name */
  const entry = (name) => c.parts.find((/** @type {any} */ p) => p.name === name);
  /** The parts whose pictures a layer holds, bottom first, down through the layers under it. @param {string} name @returns {string[]} */
  const leaves = (name) => (entry(name)?.layer ? entry(name).layer.inputs.flatMap((/** @type {string} */ h) => leaves(h.split(".")[0])) : [name]);

  // each layer as kit/compose made it, with the page box kit/run gives it
  const run = createRun(c, { runtimes });
  /** The numbers the layer derives, which a glue need not write: each layer's sum, each producer's built max and declared ceiling, each box's sides. @type {Map<number, string>} */
  const copied = new Map();
  for (const p of c.parts) {
    if (p.layer) continue;
    const rt = runtimes.find((r) => r.dialect.name === p.dialect);
    if (!rt) continue;
    for (const o of Object.values(/** @type {Record<string, any>} */ (rt.dialect.seams.out))) if (o.seam.kind === "draw") copied.set(o.seam.max, `the ${p.dialect} Dialect's declared ceiling for ${o.name}`);
    const compiled = /** @type {any} */ (compilePart(rt, p.record));
    for (const [port, d] of Object.entries(compiled.ok ? compiled.draws ?? {} : {})) copied.set(/** @type {any} */ (d).max, `${p.name}.out.${port}'s built max`);
  }
  for (const p of c.parts.filter((/** @type {any} */ x) => x.layer)) {
    const { box } = pageView(run, c, runtimes, p.name);
    const size = box ? box.max.map((/** @type {number} */ v, /** @type {number} */ i) => v - box.min[i]) : null;
    copied.set(p.layer.max, `${p.name}'s summed max`);
    for (const s of size ?? []) if (!copied.has(s)) copied.set(s, `${p.layer.frame}'s extent`);
    notes.push(`layer ${p.name}: Draw<${p.layer.max}>@${p.layer.frame}${size ? `, page box ${size.join(" by ")}` : ""}`);
    for (const x of c.wires.filter((/** @type {any} */ y) => y.to.startsWith(`${p.name}.in.`))) {
      const conv = x.convert.map((/** @type {any} */ k) => convertText({ ...k, edge: { scale: k.scale, offset: k.offset } })).join("; ");
      notes.push(`  ${x.from} → ${x.to}: ${conv || "unchanged"}`);
    }
  }
  try {
    walkNodes(parseModule(text), (node) => {
      const n = /** @type {any} */ (node);
      if (n.type !== "Literal") return;
      if (typeof n.value === "string" && /Draw</.test(n.value)) out.push({ ...t("T031", `a Draw seam is written in the glue (${JSON.stringify(n.value)})`, "the layer takes its ceilings from the producers; write none", GLUE, n.loc.start.line), severity: "warning" });
      if (typeof n.value === "number" && n.value > 16 && copied.has(n.value)) out.push({ ...t("T031", `${n.value} is ${copied.get(n.value)}; the layer derives it`, "a review flag: if the number was copied from a producer, remove it", GLUE, n.loc.start.line), severity: "warning" });
    });
  } catch { /* the load above already reported a syntax error */ }

  const [gameName, scoreName] = originals.map((f) => JSON.parse(textOf(f["wb-package.json"]) ?? "{}").name);
  /** @param {string} d */
  const partsOf = (d) => c.parts.filter((/** @type {any} */ p) => p.dialect === d).map((/** @type {any} */ p) => p.name);
  const gameParts = partsOf(gameName), scoreParts = partsOf(scoreName);
  for (const [d, ps] of /** @type {[string, string[]][]} */ ([[gameName, gameParts], [scoreName, scoreParts]])) if (!ps.length) out.push(t("T021", `no part of the composition is a ${d}`, `add a ${d} part with .part(<builder>)`, GLUE));
  /** @param {string} end */
  const partOf = (end) => end.split(".")[0];
  const wires = c.wires.map((/** @type {any} */ x) => ({ from: x.from, to: x.to, fromPart: partOf(x.from), toPart: partOf(x.to) }));
  if (!wires.some((/** @type {any} */ x) => x.from === "page.out.pad" && gameParts.includes(x.toPart))) out.push(t("T022", "the page's pad is not wired to the game", ".wire(page.out.pad, <game part>.in.<its pad input>)", GLUE));
  if (!wires.some((/** @type {any} */ x) => gameParts.includes(x.fromPart) && scoreParts.includes(x.toPart))) out.push(t("T023", "nothing the game sends is wired to the score-and-timer", ".wire(<game part>.out.<output>, <score part>.in.<input>)", GLUE));
  const shown = c.show ? entry(c.show) : null;
  if (!shown?.layer) out.push(t("T032", "the glue does not show a layer of both pictures", ".show(<game part>.out.<Draw output>, <score part>.out.<Draw output>)", GLUE));
  else {
    const order = leaves(shown.name);
    const g = order.findIndex((p) => gameParts.includes(p)), s = order.findIndex((p) => scoreParts.includes(p));
    if (g < 0 || s < 0) out.push(t("T032", `the shown layer, ${shown.name}, does not take both pictures`, "layer a Draw output of the game and one of the score-and-timer", GLUE));
    else if (s < g) out.push(t("T033", "the shown layer draws the score-and-timer's picture under the game's; the task draws the score over the game", "painter's order: give the game's output first (bottom)", GLUE));
  }
  if (out.some((d) => d.severity === "error")) return finish();
  out.push(...(await playPadScript({ composed: c, runtimes, packages: loaded }, scoreParts)));
  return finish();
}
