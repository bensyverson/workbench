// A simulation of the draft package tests (kit/package/README.md, "Tests (draft, 2026-11-27, leaf 74YzpH)"), for the
// tests dogfood (leaf mxxKTa). Throwaway: nothing in kit/ is changed. It copies kit/ to a temporary folder and patches
// the copy's kit/run with the draft's `in` input kind and `taps` (kit/run/README.md, "Draft: the `in` input and taps"),
// then runs each test as the draft's runTests would: its example alone (kit/page's examplePreset), a headless run with
// the test's inputs, each `at` read after runUntil(at), and H006–H008 for what fails.
//
// What it simulates, and where it differs from the draft:
// - `in`: an outside queue per unwired Event input (a wire with no producer and no conversion), each missing field
//   given its default, the input's keepLast honored, a step past the runtime's events.in max refused (N002), a stopped
//   part dropping. An `in` input to a wired input is refused (N011). N012 (a record that does not fit) is left to the
//   static check (tests-check.js, K021).
// - `taps`: every Event output of every part is tapped (not only the ones a test names); rewinds are not handled.
// - No replay of the test's record (the draft's N005 check).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readPackageDir } from "../../pkg/dir.js";

const KIT = fileURLToPath(new URL("../../../kit/", import.meta.url));

/** Text patches to the copy, each [file, old, new]; each old must occur exactly once. @type {Array<[string, string, string]>} */
const PATCHES = [
  ["run/log.js", `export const INPUT_KINDS = Object.freeze(["control", "param", "rebuild", "frame"]);`, `export const INPUT_KINDS = Object.freeze(["control", "param", "rebuild", "frame", "in"]);`],
  ["run/log.js", `if ((e.kind === "control" || e.kind === "param") && typeof e.name !== "string")`, `if ((e.kind === "control" || e.kind === "param" || e.kind === "in") && typeof e.name !== "string")`],
  ["run/scheduler.js", `  const wires = makeWires(composed, byName, hasPage ? PAGE : null, new Set(layers.keys()));\n`, `  const wires = makeWires(composed, byName, hasPage ? PAGE : null, new Set(layers.keys()));
  // SIM (leaf mxxKTa): the draft's \`in\` input: an outside queue per unwired Event input
  for (const p of parts) for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
    if (i.seam.kind !== "event" || wires.some((w) => w.to.part === p.name && w.to.port === i.name)) continue;
    const keepLast = i.delivery && typeof i.delivery === "object" ? i.delivery.keepLast ?? null : null;
    wires.push(/** @type {any} */ ({ index: wires.length, from: { part: "$in", port: i.name }, to: { part: p.name, port: i.name }, event: true, delay: false, fromPage: false, keepLast, overflow: null, convert: [], rename: {}, dropped: [], queue: [], drops: 0, stopDrops: 0, overflowDrops: 0, text: \`in → \${p.name}.in.\${i.name}\`, sim: true }));
  }
  /** @type {any[]} */
  const tapped = [];
`],
  ["run/scheduler.js", `    if (e.kind === "control" && e.part === PAGE && hasPage) {\n      // the log holds`, `    if (e.kind === "in") {
      if (!byName.has(e.part ?? "")) throw new RunError([{ code: "N009", message: \`an in input names no part '\${e.part}'\` }]);
      const w = /** @type {any} */ (wireTo.get(\`\${e.part}.\${e.name}\`));
      if (!w || !w.sim) throw new RunError([{ code: "N011", message: \`an in input to \${e.part}.in.\${e.name}: \${w ? "a wire feeds that input" : "the part has no such Event input"}\` }]);
      e = { ...e, value: structuredClone(e.value) };
    } else if (e.kind === "control" && e.part === PAGE && hasPage) {
      // the log holds`],
  ["run/scheduler.js", `      // insert refused an input naming no part (N009)\n`, `      if (e.kind === "in") {
        const ip = /** @type {Part} */ (byName.get(e.part ?? ""));
        const seam = /** @type {any} */ (ip.runtime.dialect.seams.in)[/** @type {string} */ (e.name)].seam;
        const defs = seam.of?.defaults ?? {};
        const value = e.value !== null && typeof e.value === "object" && !Array.isArray(e.value) ? { ...structuredClone(defs), ...e.value } : e.value;
        delivery.deliver(/** @type {any} */ (wireTo.get(\`\${e.part}.\${e.name}\`)), [value], e.T);
        continue;
      }
      // insert refused an input naming no part (N009)
`],
  ["run/scheduler.js", `      for (const [port, records] of Object.entries(r.events)) for (const w of wires) if (w.from.part === p.name && w.from.port === port) delivery.deliver(w, records, T);\n`, `      for (const [port, records] of Object.entries(r.events)) for (const w of wires) if (w.from.part === p.name && w.from.port === port) delivery.deliver(w, records, T);
      for (const [port, records] of Object.entries(r.events)) for (const rec of records) tapped.push({ part: p.name, port, T: toNumber(T), record: deepFreeze(structuredClone(rec)) });
`],
  ["run/scheduler.js", `    diagnostics, builds, hashes, checkpoints,\n`, `    diagnostics, builds, hashes, checkpoints, tapped,\n`],
];

/** @type {Promise<{ url: (p: string) => string, imp: (p: string) => Promise<any> }> | null} */
let made = null;

/** The patched kit copy, made once per process. */
export function simKit() {
  made ??= (async () => {
    const dir = join(tmpdir(), `mxxKTa-simkit-${process.pid}`);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
      cpSync(KIT, join(dir, "kit"), { recursive: true, filter: (src) => !/[/\\](test|prerelease)([/\\]|$)/.test(src.slice(KIT.length - 1)) });
      for (const [file, from, to] of PATCHES) {
        const path = join(dir, "kit", file);
        const text = readFileSync(path, "utf8");
        const n = text.split(from).length - 1;
        if (n !== 1) throw new Error(`sim patch: ${file} holds the patched text ${n} times, not once: kit/run changed, so update sim.js`);
        writeFileSync(path, text.replace(from, () => to));
      }
    }
    const url = (/** @type {string} */ p) => pathToFileURL(join(dir, "kit", p)).href;
    return { url, imp: (/** @type {string} */ p) => import(url(p)) };
  })();
  return made;
}

/**
 * A package folder loaded through the patched kit as the page loads it, with the manifest's `tests` key removed
 * (checkManifest refuses it today, K002). `tests` is the manifest's, or null when it has none.
 * @param {string} dir
 */
export async function loadForTests(dir) {
  const k = await simKit();
  const { loadOnePackage } = await k.imp("page/host/load.js");
  const files = readPackageDir(dir);
  const manifest = JSON.parse(String(files["wb-package.json"]));
  const tests = manifest.tests ?? null;
  delete manifest.tests;
  files["wb-package.json"] = JSON.stringify(manifest, null, 2) + "\n";
  const env = {
    urls: { define: k.url("define/index.js"), compose: k.url("compose/index.js") },
    makeUrl: (/** @type {string} */ text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
    importUrl: (/** @type {string} */ u) => import(u),
  };
  const { pkg, diagnostics } = await loadOnePackage(basename(dir), files, env);
  return { pkg, diagnostics, files, tests, env, kit: k };
}

/** @param {string} code @param {string} test @param {string} message @returns {any} */
const diag = (code, test, message) => ({ code, severity: "error", test, message });

/** Exact JSON-data equality, numbers within `within`. @param {unknown} a @param {unknown} b @param {number} within @returns {boolean} */
function same(a, b, within) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= within;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b || (a === undefined && b === null);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && same(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k], within));
}

const COMPONENTS = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };

/** A state path's value: `<field>.<field>`, `<list>[<i>]`, `<list>.length`, `<vector>.x`. @param {any} state @param {string} path */
export function readPath(state, path) {
  let v = state;
  for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) {
      if (part === "length") v = v.length;
      else if (/^\d+$/.test(part)) v = v[Number(part)];
      else if (part in COMPONENTS) v = v[/** @type {any} */ (COMPONENTS)[part]];
      else return null;
    } else if (typeof v === "object") v = Object.hasOwn(v, part) ? v[part] : undefined;
    else return null;
  }
  return v === undefined ? null : v;
}

/** @param {unknown} v */
const show = (v) => JSON.stringify(v);

/**
 * Runs tests (the manifest's, or `given`) against a package folder, as the draft's runTests would.
 * @param {string} dir @param {any[] | null} [given]
 * @returns {Promise<{ results: Array<{ name: string, ok: boolean, diagnostics: any[] }>, diagnostics: any[] }>}
 */
export async function runPackageTests(dir, given = null) {
  const { pkg, diagnostics: loadDiags, files, tests: own, env, kit } = await loadForTests(dir);
  const tests = given ?? own ?? [];
  if (!pkg) return { results: [], diagnostics: loadDiags.map((/** @type {any} */ d) => diag(d.code, "", d.message)) };
  const { examplePreset } = await kit.imp("page/index.js");
  const { createRun } = await kit.imp("run/index.js");
  const { moduleScope } = await kit.imp("define/index.js");
  const loaded = pkg.loaded;
  const results = [];
  for (const t of tests) {
    const out = [];
    const name = t.name;
    try {
      const url = pkg.urls.get(t.example);
      if (!url) throw new Error(`no module ${t.example}`);
      const mod = await env.importUrl(url);
      const preset = examplePreset(loaded.name, mod.default, moduleScope(String(files[t.example]), mod));
      const bad = preset.diagnostics.filter((/** @type {any} */ d) => d.severity !== "warning");
      if (!preset.composition || bad.length) { results.push({ name, ok: false, diagnostics: [diag("H008", name, `test ${name}: its example ${t.example} does not build alone: ${bad.map((/** @type {any} */ d) => `${d.code} ${d.message}`).join("; ")}`)] }); continue; }
      const composed = preset.composition.build({ packages: [loaded], runtimes: [loaded.runtime] });
      const part = composed.parts.find((/** @type {any} */ p) => p.dialect === loaded.name).name;
      const inputs = (t.inputs ?? []).map((/** @type {any} */ i) => ({ kind: "in", T: i.T, part, name: i.in, value: i.value }));
      const run = createRun(composed, { runtimes: [loaded.runtime], packages: [loaded], seed: t.seed ?? 0, inputs, build: preset.build });
      const expects = t.expect ?? [];
      const num = (/** @type {any} */ x) => (typeof x === "string" ? (() => { const [n, d] = x.split("/").map(Number); return n / (d ?? 1); })() : Number(x));
      const ends = [t.until ?? 0, ...(t.inputs ?? []).map((/** @type {any} */ i) => num(i.T)), ...expects.flatMap((/** @type {any} */ e) => [e.at, e.to].filter((x) => x !== undefined).map(num))];
      const end = Math.max(...ends);
      const stateChecks = expects.filter((/** @type {any} */ e) => e.state).sort((/** @type {any} */ a, /** @type {any} */ b) => num(a.at) - num(b.at));
      for (const e of stateChecks) {
        run.runUntil(e.at);
        const s = run.state(part);
        for (const [path, want] of Object.entries(e.state)) {
          const got = readPath(s, path);
          if (!same(got, want, e.within ?? 0)) out.push(diag("H006", name, `test ${name}: state at ${e.at} s: ${path}: expected ${show(want)}, got ${show(got)}`));
        }
      }
      run.runUntil(end);
      for (const e of expects) {
        if (e.events === undefined) continue;
        const from = e.from === undefined ? 0 : num(e.from), to = e.to === undefined ? end : num(e.to);
        const got = run.tapped.filter((/** @type {any} */ x) => x.part === part && x.port === e.events && x.T >= from && x.T <= to);
        const window = `${e.events} from ${from} s to ${to} s`;
        if (e.count !== undefined && got.length !== e.count) out.push(diag("H006", name, `test ${name}: events ${window}: ${got.length} records, expected ${e.count}${got.length ? `: ${got.slice(0, 4).map((/** @type {any} */ x) => `${show(x.record)} at ${x.T}`).join(", ")}` : ""}`));
        if (e.records !== undefined) {
          const recs = got.map((/** @type {any} */ x) => x.record);
          const i = recs.findIndex((/** @type {any} */ r, /** @type {number} */ k) => k >= e.records.length || !same(r, e.records[k], e.within ?? 0));
          if (recs.length !== e.records.length || i >= 0) {
            const k = i >= 0 ? i : Math.min(recs.length, e.records.length);
            out.push(diag("H006", name, `test ${name}: events ${window}: ${recs.length} records, expected ${e.records.length}; record ${k} is ${show(recs[k] ?? null)}${got[k] ? ` (at ${got[k].T})` : ""}, expected ${show(e.records[k] ?? null)}`));
          }
        }
      }
      const expected = expects.filter((/** @type {any} */ e) => e.diagnostic !== undefined);
      for (const e of expected) {
        const hit = run.diagnostics.some((/** @type {any} */ d) => d.code === e.diagnostic && (e.at === undefined || num(d.T) === num(e.at)));
        if (!hit) out.push(diag("H006", name, `test ${name}: expected ${e.diagnostic}${e.at !== undefined ? ` at ${e.at} s` : ""}; the run reported ${run.diagnostics.map((/** @type {any} */ d) => `${d.code} at ${d.T}`).join(", ") || "nothing"}`));
      }
      for (const d of run.diagnostics) {
        if (d.severity !== "error" || expected.some((/** @type {any} */ e) => e.diagnostic === d.code)) continue;
        out.push(diag("H007", name, `test ${name}: the run reported ${d.code}${d.part ? ` (${d.part})` : ""} at ${d.T}: ${d.message}`));
      }
    } catch (e) {
      const err = /** @type {any} */ (e);
      const codes = Array.isArray(err?.diagnostics) ? err.diagnostics.map((/** @type {any} */ d) => `${d.code} ${d.message}`).join("; ") : "";
      out.push(diag("H008", name, `test ${name}: could not run: ${codes || err?.message || String(e)}`));
    }
    results.push({ name, ok: out.length === 0, diagnostics: out });
  }
  return { results, diagnostics: results.flatMap((r) => r.diagnostics) };
}
