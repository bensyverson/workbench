// The workbench page's wiring: the URL query, the pickers, a session on a canvas, and the panels. Thin: every
// decision is the kit's (kit/package, kit/compose, kit/run, kit/page) or in the modules beside this one.

import { h, fill } from "./dom.js";
import { loadWorkbench, loadPreset, loadPackagesOnly, hostDiagnostic, elementModuleUrl, runLoadedTests, packagesWithTests } from "./load.js";
import { createSession } from "./session.js";
import { parseQuery, importedPackages, fetchPackage, fetchGlue, groupUpload, packageFromBundle, contentOf, glueOf } from "./sources.js";
import { diagnosticsView, componentView, paramEditor, codeView, chart, controlForm } from "./views.js";

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const PANEL_MS = 100;

/** @typedef {{ loaded: import("./load.js").Loaded, session: ReturnType<typeof createSession> | null, elements: Map<string, any> }} Current */

/**
 * @param {{ importModule: (url: string) => Promise<any> }} host  `import(url)`, which the kit's modules may not hold
 */
export function start({ importModule }) {
  /** @type {import("./load.js").LoadEnv} */
  const env = {
    urls: { define: new URL("../../define/index.js", import.meta.url).href, compose: new URL("../../compose/index.js", import.meta.url).href },
    makeUrl: (text) => URL.createObjectURL(new Blob([text], { type: "text/javascript" })),
    importUrl: importModule,
  };
  /** @type {{ packages: Record<string, Record<string, string | Uint8Array>>, glue: { path: string, text: string } | null, profile: string }} */
  const input = { packages: {}, glue: null, profile: "" };
  /** @type {Current | null} */
  let current = null;
  /** @type {import("./load.js").HostDiagnostic[]} */
  let hostProblems = [];
  let lastPanels = 0, lastDiag = "";
  /** The package tests' last run: shown as the Tests row under Presets, and as the "tests" diagnostics group. @type {{ running: boolean, progress: number, abort: AbortController | null, packages: Array<{ package: string, results: any[], diagnostics: any[] }> }} */
  let tests = { running: false, progress: 0, abort: null, packages: [] };
  /** The run a failed test opens: its log and seed, and the instant to pause at. @type {{ inputs: any[], seed: number, at: number } | null} */
  let opening = null;

  /** @param {string} message */
  const problem = (message) => { hostProblems.push(hostDiagnostic("host", { code: "LOAD", severity: "error", message })); showDiagnostics(); };
  /** An input the run refused (a param edit outside its declaration: N008), listed with the others; the editors go back to the run's values. @param {Array<{ code: string, message: string }>} ds */
  const refused = (ds) => { if (!ds.length) return; hostProblems.push(...ds.map((d) => hostDiagnostic("run", { ...d, severity: "error" }))); showDiagnostics(); if (current?.session) refreshParams(current.session); };
  addEventListener("error", (e) => problem(`${e.message} (${e.filename}:${e.lineno})`));
  addEventListener("unhandledrejection", (e) => problem(`unhandled: ${e.reason instanceof Error ? e.reason.message : e.reason}`));

  // ---- loading ----
  /** @param {() => Promise<import("./load.js").Loaded>} make */
  async function run(make) {
    current?.session?.stop();
    $("status").textContent = "loading…";
    let loaded;
    try { loaded = await make(); } catch (e) { loaded = null; problem(`loading threw: ${e instanceof Error ? e.stack ?? e.message : e}`); }
    if (!loaded) return;
    current = { loaded, session: null, elements: new Map() };
    $("code-name").textContent = loaded.sourceName || "no glue";
    fill($("code"), codeView(loaded.source, loaded.sourceName));
    fillPresets(loaded);
    if (!opening) tests = { running: false, progress: 0, abort: null, packages: [] };
    fillTests(loaded);
    if (loaded.composed) await mount(loaded);
    else { fill($("parts")); $("status").textContent = "did not build: see the diagnostics"; }
    showDiagnostics();
  }
  const loadGlue = () => input.glue
    ? run(() => loadWorkbench({ packages: input.packages, glue: input.glue ?? { path: "", text: "" }, ...(input.profile ? { profile: input.profile } : {}) }, env))
    : run(() => loadPackagesOnly(input.packages, env));

  /** @param {import("./load.js").Loaded} loaded */
  function fillPresets(loaded) {
    const box = $("presets");
    const items = loaded.packages.flatMap((p) => (p.loaded.examples ?? []).map((/** @type {string} */ ex) => ({ pkg: p.name, ex })));
    fill(box, items.length ? items.map(({ pkg, ex }) => h("button", { class: "btn sm", title: `load ${pkg}/${ex} alone`, onclick: () => run(() => loadPreset({ packages: input.packages, package: pkg, example: ex, ...(input.profile ? { profile: input.profile } : {}) }, env)) }, `${pkg}/${ex.replace(/^examples\//, "")}`)) : h("span", { class: "dim" }, "none: load a package"));
  }

  /** The Tests row under Presets: a Run button (in slices, with progress and Cancel), then each test, pass or fail, with Open on a failed one. A package with no tests has no row (tests are optional). @param {import("./load.js").Loaded} loaded */
  function fillTests(loaded) {
    const box = $("tests");
    const withTests = packagesWithTests(loaded);
    box.hidden = withTests.length === 0;
    if (!withTests.length) return;
    const draw = () => fill(box,
      h("button", { class: "btn sm", onclick: tests.running ? () => tests.abort?.abort() : () => runTestsRow(loaded) }, tests.running ? `Cancel (${Math.round(tests.progress * 100)}%)` : "Run tests"),
      ...tests.packages.flatMap((p) => p.results.map((/** @type {any} */ r) => {
        const failed = r.diagnostics.find((/** @type {any} */ d) => d.at !== undefined) ?? r.diagnostics[0];
        return h("span", { class: "testresult" },
          h("span", { class: r.ok ? "tag" : "tag bad" }, r.ok ? "pass" : "fail"), ` ${p.package}/${r.name} `,
          r.ok || !r.log ? null : h("button", { class: "btn sm", title: "load the test's example with its inputs, paused where it failed", onclick: () => openTest(loaded, p.package, r, failed?.at ?? r.T) }, "Open"));
      })));
    draw();
    /** @param {import("./load.js").Loaded} l */
    async function runTestsRow(l) {
      const abort = new AbortController();
      tests = { running: true, progress: 0, abort, packages: [] };
      draw();
      const r = await runLoadedTests(l, env, { signal: abort.signal, onProgress: (f) => { tests.progress = f; draw(); } });
      tests = { running: false, progress: 1, abort: null, packages: r };
      draw();
      showDiagnostics();
    }
  }
  /** Loads a failed test's example as a preset with the test's log as the run's inputs, paused at the failing instant. @param {import("./load.js").Loaded} _loaded @param {string} pkg @param {any} result @param {number} at */
  function openTest(_loaded, pkg, result, at) {
    const example = exampleOf(pkg, result.name);
    if (!example) return problem(`test ${result.name}: its example is not known`);
    opening = { inputs: result.log.inputs, seed: result.log.header.seed, at };
    run(() => loadPreset({ packages: input.packages, package: pkg, example, wirePage: false, ...(input.profile ? { profile: input.profile } : {}) }, env));
  }
  /** @param {string} pkg @param {string} name */
  const exampleOf = (pkg, name) => (current?.loaded.packages.find((p) => p.name === pkg)?.loaded.tests ?? []).find((/** @type {any} */ t) => t.name === name)?.example ?? null;

  // ---- the running page ----
  /** @param {import("./load.js").Loaded} loaded */
  async function mount(loaded) {
    const canvas = $("stage");
    const c = /** @type {Current} */ (current);
    const session = createSession(loaded, {
      context: canvas.getContext("2d"),
      requestFrame: (cb) => requestAnimationFrame(cb),
      decode: (bytes) => createImageBitmap(new Blob([/** @type {BlobPart} */ (bytes)], { type: "image/png" })),
      onFrame: (snap) => { const now = performance.now(); if (now - lastPanels >= PANEL_MS || snap.status.paused) { lastPanels = now; panels(snap); } },
      onProblem: problem,
      ...(opening ? { run: { inputs: opening.inputs, seed: opening.seed } } : {}),
    });
    c.session = session;
    const size = session.page.size;
    canvas.hidden = !size;
    if (size) { canvas.width = size.width; canvas.height = size.height; canvas.style.aspectRatio = `${size.width} / ${size.height}`; }
    buildParts(loaded, session);
    buildControls(session);
    await session.page.ready;
    // Open on a failed test: paused at the instant the expectation read, not running on
    if (opening) { session.seek(opening.at); opening = null; } else session.start();
    panels(session.snapshot());
  }

  /** The per-part panels, built once: inputs and param editors keep their focus while the tiles refresh. @param {import("./load.js").Loaded} loaded @param {ReturnType<typeof createSession>} session */
  function buildParts(loaded, session) {
    const snap = session.snapshot();
    fill($("parts"), snap.parts.map((/** @type {any} */ p) => {
      const dialect = loaded.composed.parts.find((/** @type {any} */ q) => q.name === p.part)?.dialect;
      const record = loaded.composed.parts.find((/** @type {any} */ q) => q.name === p.part).record;
      const params = Object.entries(record.params ?? {});
      return h("section", { class: "part", id: `part-${p.part}` },
        h("h3", null, p.part, h("span", { class: "tag" }, dialect)),
        h("div", { class: "tiles", "data-tiles": p.part }),
        params.length ? h("details", { open: true }, h("summary", null, "Params"), h("div", { "data-params": p.part }, paramEditors(session, p, params))) : null,
        h("details", null, h("summary", null, "Traces"), h("div", { "data-traces": p.part })),
        h("details", null, h("summary", null, "State"), h("pre", { class: "state", "data-state": p.part })));
    }));
  }

  /**
   * A part's param editors, showing the run's values (`run.params`, which a rewind changes).
   * @param {ReturnType<typeof createSession>} session @param {any} p  the part's snapshot @param {Array<[string, unknown]>} params  the declarations
   */
  function paramEditors(session, p, params) {
    return params.map(([name, decl]) => paramEditor(name, /** @type {any} */ (decl), session.paramAnnotation(p.part, name, p.state, p.params), (v) => refused(session.setParam(p.part, name, v)), p.params[name]));
  }
  /** After a rewind the run's params may differ from what the editors show: build them again. @param {ReturnType<typeof createSession>} session */
  function refreshParams(session) {
    const c = current;
    if (!c) return;
    for (const p of session.snapshot().parts) {
      const box = document.querySelector(`[data-params="${p.part}"]`);
      const record = c.loaded.composed?.parts.find((/** @type {any} */ q) => q.name === p.part)?.record;
      if (box && record) fill(box, paramEditors(session, p, Object.entries(record.params ?? {})));
    }
  }

  /** The generated controls view: an on-screen form per wired Control, in declaration order. @param {ReturnType<typeof createSession>} session */
  function buildControls(session) {
    const forms = session.forms();
    fill($("controls"), forms.map((f) => controlForm(f, (record) => refused(session.control(f.name, record)), (on) => session.page.focus(on ? f.name : null))));
    $("keys").textContent = forms.map((f) => Object.keys(f.keys ?? {}).length || Array.isArray(f.keys) ? `${f.label ?? f.name}: ${JSON.stringify(f.keys)}` : null).filter(Boolean).join(" · ");
    showLock(session);
  }
  /** The lock overlay, shown while the page waits for its one gesture. @param {ReturnType<typeof createSession>} session */
  function showLock(session) { $("lock").hidden = !session.page.locked; }

  /** @param {import("./session.js").Snapshot} snap */
  function panels(snap) {
    const c = current;
    if (!c?.session) return;
    const { status } = snap;
    $("status").textContent = `T ${status.seconds.toFixed(2)} s${status.paused ? " (paused)" : ""}${status.view ? ` · ${status.view.part}.${status.view.port}: ${status.view.ops} ops` : ""}`;
    const scrub = $("scrub");
    scrub.max = String(snap.head);
    if (document.activeElement !== scrub) scrub.value = String(status.seconds);
    $("pause").textContent = status.paused ? "Resume" : "Pause";
    const io = {
      series: (/** @type {string} */ k) => c.session?.series.get(k).map((p) => p) ?? [],
      sweep: (/** @type {any} */ x) => c.session?.sweepState(x.part, x.spec) ?? null,
      // the session notifies as the sweep goes, so the panels show its progress; a throw is one reported problem
      runSweep: (/** @type {any} */ x) => { c.session?.sweep(x.part, x.spec).catch((e) => problem(`the sweep threw: ${e instanceof Error ? e.message : e}`)); },
      cancelSweep: (/** @type {any} */ x) => c.session?.cancelSweep(x.part, x.spec),
      element: () => null,
    };
    for (const p of snap.parts) {
      const tiles = document.querySelector(`[data-tiles="${p.part}"]`);
      if (tiles) fill(tiles, p.tiles.map((t) => h("div", { class: "tile" }, h("h4", null, t.title), t.body.map((x) => componentView(withPart(x, p.part), io)))));
      const tr = document.querySelector(`[data-traces="${p.part}"]`);
      if (tr) fill(tr, p.traces.map((t) => h("div", { class: "trace" }, h("span", { class: "k" }, t.path, " ", h("b", null, String(Math.round(t.value * 1000) / 1000))), chart(c.session?.series.get(`${p.part}/${t.path}`).map((q) => ({ x: q.T, y: q.y })) ?? [], { h: 28 }))));
      const st = document.querySelector(`[data-state="${p.part}"]`);
      if (st && st.parentElement?.hasAttribute("open")) st.textContent = JSON.stringify(p.state, null, 1);
    }
    textStage(c, snap);
    $("why").textContent = c.session.why();
    showDiagnostics(snap);
  }

  /** A runs component needs its part for the sweep. @param {any} x @param {string} part */
  function withPart(x, part) { x.part = part; if (x.items) x.items.forEach((/** @type {any} */ i) => withPart(i, part)); return x; }

  /**
   * The stage when nothing draws on the canvas: the UI's custom element when its module loaded, else the text view.
   * Never for a layer, which always draws and has no package to look up by its name.
   * @param {Current} c @param {import("./session.js").Snapshot} snap
   */
  function textStage(c, snap) {
    const box = $("textstage");
    const name = c.loaded.composed.show;
    box.hidden = !!c.session?.page.size || c.loaded.composed.parts.some((/** @type {any} */ q) => q.name === name && q.layer !== undefined);
    if (box.hidden) return;
    const part = snap.parts.find((p) => p.part === name);
    const dialect = c.loaded.composed.parts.find((/** @type {any} */ q) => q.name === name)?.dialect;
    const pkg = c.loaded.packages.find((q) => q.name === dialect);
    const stage = pkg?.loaded.ui?.stage;
    if (!part?.state) return;
    if (stage?.element) {
      let el = c.elements.get(stage.element);
      if (el === undefined) {
        c.elements.set(stage.element, null);
        const { url, diagnostics } = pkg ? elementModuleUrl(pkg, String(stage.module)) : { url: null, diagnostics: [] };
        for (const d of diagnostics) problem(`${d.code}: ${d.message}`);
        (url ? importModule(url).then(() => { if (customElements.get(stage.element)) c.elements.set(stage.element, document.createElement(stage.element)); else problem(`${stage.module} did not define <${stage.element}>`); }).catch((e) => problem(`${stage.module} did not load: ${e.message}`)) : Promise.resolve(problem(`no module ${stage.module} in package ${dialect}`)));
      }
      el = c.elements.get(stage.element);
      if (el) {
        // a throw here propagates to the session, which says it once while it repeats
        el.state = part.state; el.params = part.params; el.text = pkg?.loaded.dialect.text(part.state);
        if (el.parentElement !== box) fill(box, el);
        return;
      }
    }
    try { fill(box, h("pre", { class: "textview" }, pkg?.loaded.dialect.text(part.state))); } catch (e) { fill(box, h("pre", { class: "bad" }, `the text view threw: ${e instanceof Error ? e.message : e}`)); }
  }

  /** @param {import("./session.js").Snapshot} [snap] */
  function showDiagnostics(snap) {
    const c = current;
    const status = snap?.status ?? c?.session?.page.status();
    const run = (status?.diagnostics ?? []).map((/** @type {any} */ d) => hostDiagnostic("run", { ...d, text: `${d.code} ${d.part ? `${d.part} ` : ""}at T=${d.T}: ${d.message}` }));
    const page = (status?.page ?? []).map((/** @type {any} */ d) => hostDiagnostic("page", { ...d, text: `${d.code} ${d.message}` }));
    const halted = status?.halted ? [hostDiagnostic("page", { ...status.halted, text: `${status.halted.code} ${status.halted.message} (the frame loop stopped: press Resume)` })] : [];
    const testDiagnostics = tests.packages.flatMap((p) => p.diagnostics).map((/** @type {any} */ d) => hostDiagnostic("tests", d));
    const all = [...hostProblems, ...testDiagnostics, ...(c?.loaded.diagnostics ?? []), ...halted, ...page, ...run];
    const key = JSON.stringify(all.map((d) => d.text));
    if (key === lastDiag) return;
    lastDiag = key;
    $("diag-count").textContent = String(all.length);
    $("diag-count").className = all.some((d) => d.severity === "error") ? "tag bad" : "tag";
    fill($("diag"), diagnosticsView(all));
  }

  // ---- controls ----
  $("pause").onclick = () => { const s = current?.session; if (!s) return; if (s.page.status().halted) { s.start(); s.resume(); } else if (s.page.driver.paused) s.resume(); else s.pause(); };
  $("step").onclick = () => { const s = current?.session; if (s) { s.pause(); s.step(); } };
  $("scrub").oninput = (/** @type {any} */ e) => { const s = current?.session; if (!s) return; s.scrub(Number(e.target.value)); refreshParams(s); };
  $("profile").onchange = (/** @type {any} */ e) => { input.profile = e.target.value; if (input.glue || current) loadGlue(); };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) && t.getAttribute("type") !== "range") return;
    if (current?.session?.key(e)) e.preventDefault();
  };
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKey);
  // focus leaves the page: every held Control is let go, so nothing sticks down (requirement 13)
  addEventListener("blur", () => current?.session?.page.blur());
  // the pointer on the stage, in canvas pixels, to the part under it (kit/page routes it)
  const canvas = $("stage");
  /** @param {PointerEvent | WheelEvent} e */
  const onPointer = (e) => {
    const s = current?.session;
    if (!s) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * canvas.width) / r.width, y = ((e.clientY - r.top) * canvas.height) / r.height;
    const taken = s.page.pointer({ type: e.type, x, y, pointerId: /** @type {any} */ (e).pointerId ?? 0, buttons: e.buttons, detail: e.detail, deltaX: /** @type {any} */ (e).deltaX ?? 0, deltaY: /** @type {any} */ (e).deltaY ?? 0, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, timeStamp: e.timeStamp });
    if (taken) e.preventDefault();
    showLock(s);
  };
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave", "wheel"]) canvas.addEventListener(t, onPointer);
  // one gesture unlocks everything: focus, the hooks a Control needs (MIDI), and the run (requirement 13)
  $("lock").onclick = () => { const s = current?.session; if (!s) return; s.page.unlock(); canvas.focus?.(); showLock(s); };

  // ---- uploads ----
  $("up-folder").onchange = async (/** @type {any} */ e) => {
    const files = /** @type {File[]} */ ([...e.target.files]);
    const entries = await Promise.all(files.map(async (f) => ({ path: f.webkitRelativePath || f.name, content: contentOf(f.webkitRelativePath || f.name, await f.arrayBuffer()) })));
    const g = groupUpload(entries);
    hostProblems.push(...g.diagnostics);
    input.packages = { ...input.packages, ...g.packages };
    if (g.glue) input.glue = g.glue;
    else if (g.glues.length > 1) problem(`the folder holds several glue files (${g.glues.join(", ")}) and none is workbench.js: pick one with Glue file`);
    await loadGlue();
  };
  $("up-bundle").onchange = async (/** @type {any} */ e) => {
    for (const f of /** @type {File[]} */ ([...e.target.files])) {
      const b = packageFromBundle(await f.text());
      if (b.files) input.packages = { ...input.packages, [b.label]: b.files };
      else { hostProblems.push(...b.diagnostics); }
    }
    await loadGlue();
  };
  $("up-glue").onchange = async (/** @type {any} */ e) => {
    const f = /** @type {File | undefined} */ (e.target.files?.[0]);
    if (!f) return;
    const g = glueOf(f.name, new Uint8Array(await f.arrayBuffer()));
    hostProblems.push(...g.diagnostics);
    if (g.glue) { input.glue = g.glue; await loadGlue(); } else showDiagnostics();
  };

  // ---- the URL ----
  (async () => {
    const q = parseQuery(location.search);
    if (q.profile) { input.profile = q.profile; $("profile").value = q.profile; }
    if (q.workbench) {
      const url = new URL(q.workbench, location.href).href;
      const g = await fetchGlue(url, (u) => fetch(u));
      hostProblems.push(...g.diagnostics);
      input.glue = g.glue;
      const dirs = q.packages.length ? q.packages.map((p) => new URL(p, location.href).href) : g.glue ? importedPackages(g.glue.text).map((n) => new URL(`${n}/`, url).href) : [];
      for (const dir of dirs) { const p = await fetchPackage(dir, (u) => fetch(u)); hostProblems.push(...p.diagnostics); input.packages[p.label] = p.files; }
    } else if (q.packages.length) {
      for (const d of q.packages) { const dir = new URL(d, location.href).href; const p = await fetchPackage(dir, (u) => fetch(u)); hostProblems.push(...p.diagnostics); input.packages[p.label] = p.files; }
    }
    if (q.preset && input.packages) {
      const [pkg, ...rest] = q.preset.split("/");
      await run(() => loadPreset({ packages: input.packages, package: pkg, example: rest.join("/"), ...(input.profile ? { profile: input.profile } : {}) }, env));
    } else if (q.workbench || q.packages.length) await loadGlue();
    else { $("status").textContent = "load a workbench: ?workbench=<glue>&packages=<dirs>, or upload"; showDiagnostics(); }
  })();
}
