// The M4 trial's leg checks. An author leg (game, score): one package folder loaded as the workbench page loads it
// (kit/page/host/load.js), its examples built (kit/package's checkExamples), its ports read, and each example played
// on kit/page with a stub canvas. The compose leg: the folder loaded as the page loads it (the glue and every package
// beside it), its wires read, and the composition played with a pad script. The T codes are the trial's own.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readPackageDir, PackageDirError } from "../../pkg/dir.js";
import { checkExamples, textOf } from "../../../kit/package/index.js";
import { compose, page } from "../../../kit/compose/index.js";
import { loadOnePackage, loadWorkbench, hostDiagnostic } from "../../../kit/page/host/load.js";
import { moduleScope } from "../../../kit/define/index.js";
import { parseSeam, compareSeams } from "../../../kit/seam/index.js";
import { ENV, drivenPage } from "./env.js";

/** @typedef {{ code: string, severity: "error" | "warning", message: string, fix: string, file: string, line: number }} Diagnostic */
/** @typedef {{ ok: boolean, diagnostics: Diagnostic[] }} CheckResult */

/** The folder to check is missing or is not what the role takes. */
export class CheckTargetError extends Error {}

export const ROLES = Object.freeze(["game", "score", "compose"]);

/** Frames a second on the checker's page. */
const FPS = 60;
/** The compose leg's pad script: each direction held this many seconds, in this order, from the start. */
export const PAD_SCRIPT = Object.freeze({ hold: 3, order: ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"], seconds: 30 });
/** How long the score leg runs each example, in seconds (M4_TRIAL_SCORE_SECONDS shortens it for the tests). */
const SCORE_SECONDS = Number(process.env.M4_TRIAL_SCORE_SECONDS) || 65;

/** @param {string} code @param {string} message @param {string} fix @param {string} [file] @param {number} [line] @returns {Diagnostic} */
const t = (code, message, fix, file = "wb-package.json", line = 1) => ({ code, severity: "error", message, fix, file, line });

/** A host diagnostic as the checker prints it. @param {any} d @param {string} file @returns {Diagnostic} */
const fromHost = (d, file) => ({ code: d.code, severity: d.severity === "warning" ? "warning" : "error", message: d.message, fix: d.fix ?? "see the code's documentation", file: typeof d.file === "string" && !d.file.startsWith("data:") ? d.file : file, line: d.line ?? 1 });

/** @param {any} seam */
const kindOf = (seam) => seam?.kind;
/** The page pad's seam, as a Dialect's input would hold it. */
const PAD_SEAM = /** @type {any} */ (parseSeam(/** @type {any} */ (page.out.pad).seam)).type;
/** Whether the page's pad can be wired to an input of this seam, by kit/seam's own comparison (what kit/compose uses). @param {any} seam */
const takesPad = (seam) => kindOf(seam) === "event" && compareSeams(PAD_SEAM, seam).problems.length === 0;

/** @param {string} dir @returns {Record<string, string | Uint8Array>} */
function readPackage(dir) {
  let files;
  try { files = readPackageDir(dir); } catch (e) { if (e instanceof PackageDirError) throw new CheckTargetError(e.message); throw e; }
  if (!("wb-package.json" in files)) throw new CheckTargetError(`${dir} has no wb-package.json; pass the package folder`);
  return files;
}

/**
 * H and N diagnostics of a page and its run.
 * @param {any} pg @param {string} file
 */
const runDiagnostics = (pg, file) => [
  ...pg.diagnostics.map((/** @type {any} */ d) => fromHost({ ...d, fix: d.fix ?? "see kit/page's codes" }, file)),
  ...pg.run.diagnostics.map((/** @type {any} */ d) => fromHost({ ...d, message: `${d.part ? `${d.part}: ` : ""}${d.message} (at T=${d.T})`, fix: d.fix ?? "see kit/run's codes" }, file)),
];

/** The shown list as text. @param {any} pg */
const shownList = (pg) => {
  const view = pg.status().view;
  if (!view) return null;
  const snap = pg.run.snapshot(view.part);
  return JSON.stringify(snap?.draws?.[view.port] ?? null);
};

/** @param {any} pg @param {string} code @param {"keydown" | "keyup"} type */
const key = (pg, code, type) => pg.key({ type, code });

/**
 * An author leg.
 * @param {string} dir  the package folder
 * @param {"game" | "score"} role
 * @returns {Promise<CheckResult>}
 */
export async function checkAuthor(dir, role) {
  const files = readPackage(dir);
  /** @type {Diagnostic[]} */
  const out = [];
  const { pkg, diagnostics } = await loadOnePackage(basename(dir), files, ENV);
  out.push(...diagnostics.map((d) => fromHost(d, "wb-package.json")));
  if (!pkg) return done(out);
  const loaded = pkg.loaded;
  /** @param {string} p */
  const importModule = (p) => ENV.importUrl(/** @type {string} */ (pkg.urls.get(p)));
  const ex = await checkExamples(loaded, { importModule, buildOptions: (p, mod) => moduleScope(textOf(files[p]) ?? "", mod) });
  out.push(...ex.map((d) => fromHost(d, "wb-package.json")));
  const seams = loaded.dialect.seams ?? { in: {}, out: {} };
  const outs = Object.values(seams.out ?? {});
  const ins = Object.entries(seams.in ?? {});
  const dialectFile = checkedEntry(files, "dialect");
  if (!(loaded.examples ?? []).length) out.push(t("T002", "the package has no example", 'list at least one Program in the manifest\'s "examples"'));
  if (!outs.some((o) => kindOf(o.seam) === "draw")) out.push(t("T003", "the Dialect offers no picture: no Draw output", "add a Draw<<max>>@<frame> output to ports.out (docs/kit/API.md, Seams: \"A picture on the wire\")", dialectFile));
  if (!loaded.runtime) out.push(t("T008", "the package has no runtime, so it cannot run on the page", "name your defineRuntime module in the manifest's entry.runtime"));
  if (!outs.some((o) => kindOf(o.seam) !== "draw" && kindOf(o.seam) !== "event")) out.push(t("T007", "the Dialect offers no value output", "add a value output to ports.out (a path or a value lambda in `from`)", dialectFile));
  /** @type {string | undefined} */
  let padInput;
  if (role === "game") {
    if (!loaded.ui?.stage?.draw) out.push(t("T004", "the package's UI has no Draw stage", 'give the UI stage: { draw: "<your Draw output>" }', checkedEntry(files, "ui")));
    if (!Object.values(loaded.data ?? {}).some((/** @type {any} */ d) => d.kind === "image")) out.push(t("T005", "the Dialect declares no image with a PNG file", "copy sprites.png into the package, declare it in images with its file, and hash the package", dialectFile));
    padInput = ins.find(([, i]) => takesPad(i.seam))?.[0];
    if (padInput === undefined) out.push(t("T006", `the Dialect has no Event input with the page pad's seam, ${/** @type {any} */ (page.out.pad).seam ? "Event<{ up: bool, down: bool, left: bool, right: bool }>" : ""}, so the page's D-pad cannot be wired to it`, "add that input to ports.in (docs/kit/compose/README.md, \"The page\")", dialectFile));
    if (!outs.some((o) => kindOf(o.seam) === "event")) out.push(t("T009", "the Dialect offers no Event output for a pickup", "add an Event output that your runtime pushes a record to on each pickup", dialectFile));
  } else if (!ins.some(([, i]) => kindOf(i.seam) === "event")) out.push(t("T009", "the Dialect has no Event input for a scoring event", "add an Event input to ports.in", dialectFile));
  if (ex.length || !loaded.runtime) return done(out);
  for (const example of loaded.examples) out.push(...(await playExample(pkg, example, role, padInput)));
  return done(out);
}

/** @param {Record<string, string | Uint8Array>} files @param {string} which */
function checkedEntry(files, which) {
  try { return JSON.parse(textOf(files["wb-package.json"]) ?? "{}").entry?.[which] ?? "wb-package.json"; } catch { return "wb-package.json"; }
}

/**
 * One example on the page, alone (the page's pad wired to the game's pad input).
 * @param {any} pkg @param {string} example @param {"game" | "score"} role @param {string | undefined} padInput
 * @returns {Promise<Diagnostic[]>}
 */
async function playExample(pkg, example, role, padInput) {
  const loaded = pkg.loaded;
  /** @type {Diagnostic[]} */
  const out = [];
  const mod = await ENV.importUrl(pkg.urls.get(example));
  const builder = mod.default(Object.freeze({}));
  let composition = compose(loaded.name).part(builder);
  if (padInput !== undefined) composition = composition.wire(page.out.pad, builder.in[padInput]);
  composition = composition.show(builder);
  const options = { packages: [loaded], build: moduleScope(textOf(pkg.files[example]) ?? "", mod), runtimes: [loaded.runtime] };
  const found = composition.check(options).map((/** @type {any} */ d) => fromHost(hostDiagnostic("composition", d), example));
  out.push(...found);
  if (found.some((/** @type {Diagnostic} */ d) => d.severity === "error")) return out;
  const composed = composition.build(options);
  const { page: pg, context, frames } = await drivenPage({ composed, runtimes: [loaded.runtime], packages: [loaded] });
  /** @type {string[]} */
  const lists = [];
  const sample = () => { lists.push(shownList(pg) ?? "null"); };
  if (role === "game") {
    frames(FPS); sample();
    key(pg, "ArrowRight", "keydown"); frames(FPS); key(pg, "ArrowRight", "keyup");
    key(pg, "ArrowDown", "keydown"); frames(FPS); key(pg, "ArrowDown", "keyup");
    frames(5); sample();
    if (lists[0] === lists[1]) out.push(t("T010", `${example}: holding right, then down, changed nothing in the picture`, "move the player on the pad's records, and draw the player where it stands", example));
    if (!context.calls.drawImage) out.push(t("T012", `${example}: no image was drawn`, "draw the player (or the gems) with an image op naming your declared image", example));
  } else {
    frames(FPS); sample();
    frames(2 * FPS); sample();
    frames((SCORE_SECONDS - 3) * FPS); sample();
    if (lists[0] === lists[1]) out.push(t("T010", `${example}: the picture did not change between the first and the third second`, "draw the time left, so it changes as the round runs down", example));
  }
  if (lists.some((l) => l === "null" || l === "[]")) out.push(t("T011", `${example}: the shown picture was empty`, "build at least one op in your Draw output", example));
  out.push(...runDiagnostics(pg, example));
  return out;
}

/** @param {Diagnostic[]} out @returns {CheckResult} */
const done = (out) => ({ ok: !out.some((d) => d.severity === "error"), diagnostics: out });

/** @param {Record<string, string | Uint8Array>} a @param {Record<string, string | Uint8Array>} b */
function sameFiles(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join("\n") !== kb.join("\n")) return false;
  return ka.every((k) => Buffer.from(/** @type {any} */ (a[k])).equals(Buffer.from(/** @type {any} */ (b[k]))));
}

/**
 * The compose leg.
 * @param {string} dir  the leg folder: workbench.js and the package folders
 * @param {string[]} given  the two author packages as their legs left them: the game's, then the score's
 * @returns {Promise<CheckResult>}
 */
export async function checkCompose(dir, given) {
  if (!existsSync(dir)) throw new CheckTargetError(`${dir} does not exist`);
  const originals = given.map((g) => readPackage(g));
  /** @type {Diagnostic[]} */
  const out = [];
  /** @type {Record<string, Record<string, string | Uint8Array>>} */
  const packages = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".") && existsSync(join(dir, e.name, "wb-package.json"))) packages[e.name] = readPackageDir(join(dir, e.name));
  }
  given.forEach((g, i) => {
    const name = basename(g);
    if (!packages[name]) out.push(t("T027", `the package ${name}/ you were given is not in the folder`, `put ${name}/ back as you were given it`, `${name}/wb-package.json`));
    else if (!sameFiles(packages[name], originals[i])) out.push(t("T027", `the package ${name}/ you were given was changed`, `restore ${name}/ as you were given it, and report what it lacked under Gaps`, `${name}/wb-package.json`));
  });
  const gluePath = join(dir, "workbench.js");
  if (!existsSync(gluePath)) { out.push(t("T020", "there is no workbench.js", "write the glue as workbench.js in your folder", "workbench.js")); return done(out); }
  const w = await loadWorkbench({ packages, glue: { path: "workbench.js", text: readFileSync(gluePath, "utf8") } }, ENV);
  out.push(...w.diagnostics.map((d) => fromHost(d, "workbench.js")));
  if (!w.composed) { if (!out.some((d) => d.severity === "error")) out.push(t("T020", "the composition did not build", "see the diagnostics above", "workbench.js")); return done(out); }
  const c = w.composed;
  const [gameName, scoreName] = originals.map((f) => JSON.parse(textOf(f["wb-package.json"]) ?? "{}").name);
  /** @param {string} d */
  const partsOf = (d) => c.parts.filter((/** @type {any} */ p) => p.dialect === d).map((/** @type {any} */ p) => p.name);
  const gameParts = partsOf(gameName), scoreParts = partsOf(scoreName);
  for (const [d, ps] of /** @type {[string, string[]][]} */ ([[gameName, gameParts], [scoreName, scoreParts]])) if (!ps.length) out.push(t("T021", `no part of the composition is a ${d}`, `add a ${d} part with .part(<builder>)`, "workbench.js"));
  /** @param {string} end */
  const partOf = (end) => end.split(".")[0];
  const wires = c.wires.map((/** @type {any} */ x) => ({ from: x.from, to: x.to, fromPart: partOf(x.from), toPart: partOf(x.to) }));
  if (!wires.some((/** @type {any} */ x) => x.from === "page.out.pad" && gameParts.includes(x.toPart))) out.push(t("T022", "the page's pad is not wired to the game", `.wire(page.out.pad, <game part>.in.<its pad input>)`, "workbench.js"));
  if (!wires.some((/** @type {any} */ x) => gameParts.includes(x.fromPart) && scoreParts.includes(x.toPart))) out.push(t("T023", "nothing the game sends is wired to the score-and-timer", ".wire(<game part>.out.<output>, <score part>.in.<input>)", "workbench.js"));
  /** @type {Map<string, any>} */
  const dialects = new Map(w.packages.map((p) => [p.name, p.loaded.dialect]));
  const dialectOf = (/** @type {string} */ part) => c.parts.find((/** @type {any} */ p) => p.name === part)?.dialect;
  /** @param {string} end */
  const isDrawOut = (end) => { const [part, , port] = end.split("."); return kindOf(dialects.get(dialectOf(part))?.seams?.out?.[port]?.seam) === "draw"; };
  const intoShown = wires.filter((/** @type {any} */ x) => x.toPart === c.show && isDrawOut(x.from));
  const pictured = (/** @type {string[]} */ ps) => ps.includes(c.show) || intoShown.some((/** @type {any} */ x) => ps.includes(x.fromPart));
  if (!pictured(gameParts) || !pictured(scoreParts)) out.push(t("T024", `the shown part, ${c.show}, does not take both pictures`, "show a part whose Draw inputs are wired from the game's and the score-and-timer's Draw outputs", "workbench.js"));
  if (out.some((d) => d.severity === "error")) return done(out);
  const built = { composed: c, runtimes: w.runtimes, packages: w.packages.map((p) => p.loaded) };
  const played = await drivenPage(built);
  const still = await drivenPage(built);
  const segment = PAD_SCRIPT.hold * FPS;
  for (let i = 0; i * PAD_SCRIPT.hold < PAD_SCRIPT.seconds; i++) {
    const k = PAD_SCRIPT.order[i % PAD_SCRIPT.order.length];
    key(played.page, k, "keydown"); played.frames(segment); key(played.page, k, "keyup");
    still.frames(segment);
  }
  played.frames(2); still.frames(2);
  if (!played.context.calls.drawImage) out.push(t("T025", "the shown picture drew no image", "wire the game's picture, which draws its sprites, into the shown part", "workbench.js"));
  const list = shownList(played.page);
  if (list === null || list === "[]") out.push(t("T011", "the shown picture was empty at the end of the pad script", "build ops in the shown Draw output", "workbench.js"));
  const scoreState = (/** @type {any} */ pg) => JSON.stringify(scoreParts.map((/** @type {string} */ p) => pg.run.state(p)));
  if (scoreState(played.page) === scoreState(still.page)) out.push(t("T026", `after ${PAD_SCRIPT.seconds} s of the pad script, the score-and-timer's state is the same as with no input: the play never scored`, "lay the level out so the pad script picks up a gem, and wire the pickups to the score", "workbench.js"));
  out.push(...runDiagnostics(played.page, "workbench.js"));
  return done(out);
}
