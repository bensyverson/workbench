// The workbench page's wiring: the URL query, the pickers, a session on a canvas, and the panels. Thin: every
// decision is the kit's (kit/package, kit/compose, kit/run, kit/page) or in the modules beside this one.

import { DEFAULT_KEYS } from "../index.js";
import { h, fill } from "./dom.js";
import { loadWorkbench, loadPreset, loadPackagesOnly, hostDiagnostic } from "./load.js";
import { createSession } from "./session.js";
import { parseQuery, importedPackages, fetchPackage, fetchGlue, groupUpload, packageFromBundle, contentOf } from "./sources.js";
import { diagnosticsView, componentView, paramEditor, codeView, chart } from "./views.js";

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const PANEL_MS = 100;
const PAD_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", a: "KeyX", b: "KeyZ", start: "Enter", select: "ShiftLeft" };

/** @typedef {{ loaded: import("./load.js").Loaded, session: ReturnType<typeof createSession> | null, sweeps: Map<string, any>, elements: Map<string, any> }} Current */

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

  /** @param {string} message */
  const problem = (message) => { hostProblems.push(hostDiagnostic("host", { code: "LOAD", severity: "error", message })); showDiagnostics(); };
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
    current = { loaded, session: null, sweeps: new Map(), elements: new Map() };
    $("code-name").textContent = loaded.sourceName || "no glue";
    fill($("code"), codeView(loaded.source, loaded.sourceName));
    fillPresets(loaded);
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
    });
    c.session = session;
    const size = session.page.size;
    canvas.hidden = !size;
    if (size) { canvas.width = size.width; canvas.height = size.height; canvas.style.aspectRatio = `${size.width} / ${size.height}`; }
    buildParts(loaded, session);
    await session.page.ready;
    session.start();
    panels(session.snapshot());
  }

  /** The per-part panels, built once: inputs and param editors keep their focus while the tiles refresh. @param {import("./load.js").Loaded} loaded @param {ReturnType<typeof createSession>} session */
  function buildParts(loaded, session) {
    const snap = session.snapshot();
    fill($("parts"), snap.parts.map((/** @type {any} */ p) => {
      const dialect = loaded.composed.parts.find((/** @type {any} */ q) => q.name === p.part)?.dialect;
      const ui = loaded.packages.find((q) => q.name === dialect)?.loaded.ui;
      const record = loaded.composed.parts.find((/** @type {any} */ q) => q.name === p.part).record;
      const buttons = ui?.inputs ? inputButtons(session, p.part, ui.inputs) : null;
      const params = Object.entries(record.params ?? {});
      return h("section", { class: "part", id: `part-${p.part}` },
        h("h3", null, p.part, h("span", { class: "tag" }, dialect)),
        buttons,
        h("div", { class: "tiles", "data-tiles": p.part }),
        params.length ? h("details", { open: true }, h("summary", null, "Params"), params.map(([name, decl]) => paramEditor(name, /** @type {any} */ (decl), session.paramAnnotation(p.part, name, p.state, p.params), (v) => session.setParam(p.part, name, v)))) : null,
        h("details", null, h("summary", null, "Traces"), h("div", { "data-traces": p.part })),
        h("details", null, h("summary", null, "State"), h("pre", { class: "state", "data-state": p.part })));
    }));
  }

  /** @param {ReturnType<typeof createSession>} session @param {string} part @param {any} inputs */
  function inputButtons(session, part, inputs) {
    /** @type {Record<string, boolean>} */
    const held = Object.fromEntries(Object.keys(inputs.buttons).map((k) => [k, false]));
    /** @param {string} k @param {boolean} down */
    const set = (k, down) => { if (held[k] === down) return; held[k] = down; session.control(part, held); };
    return h("div", { class: "inputs" }, Object.entries(inputs.buttons).map(([k, b]) => h("button", {
      class: "btn", onpointerdown: (/** @type {any} */ e) => { e.target.setPointerCapture?.(e.pointerId); set(k, true); },
      onpointerup: () => set(k, false), onpointercancel: () => set(k, false), onlostpointercapture: () => set(k, false),
    }, /** @type {any} */ (b).label ?? k)));
  }

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
      sweep: (/** @type {any} */ x) => c.sweeps.get(x.label) ?? null,
      runSweep: (/** @type {any} */ x) => { c.sweeps.set(x.label, c.session?.sweep(x.part, x.spec) ?? null); panels(c.session?.snapshot() ?? snap); },
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

  /** The stage when nothing draws on the canvas: the UI's custom element when its module loaded, else the text view. @param {Current} c @param {import("./session.js").Snapshot} snap */
  function textStage(c, snap) {
    const box = $("textstage");
    const name = c.loaded.composed.show;
    box.hidden = !!c.session?.page.size;
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
        const url = pkg?.urls.get(String(stage.module).replace(/^\.\//, ""));
        (url ? importModule(url).then(() => { if (customElements.get(stage.element)) c.elements.set(stage.element, document.createElement(stage.element)); else problem(`${stage.module} did not define <${stage.element}>`); }).catch((e) => problem(`${stage.module} did not load: ${e.message}`)) : Promise.resolve(problem(`no module ${stage.module} in package ${dialect}`)));
      }
      el = c.elements.get(stage.element);
      if (el) {
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
    const all = [...hostProblems, ...(c?.loaded.diagnostics ?? []), ...halted, ...page, ...run];
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
  $("scrub").oninput = (/** @type {any} */ e) => current?.session?.scrub(Number(e.target.value));
  $("profile").onchange = (/** @type {any} */ e) => { input.profile = e.target.value; if (input.glue || current) loadGlue(); };
  for (const [name, code] of Object.entries(PAD_KEYS)) {
    const b = $(`pad-${name}`);
    b.onpointerdown = (/** @type {any} */ e) => { b.setPointerCapture?.(e.pointerId); current?.session?.key({ type: "keydown", code }); };
    const up = () => current?.session?.key({ type: "keyup", code });
    b.onpointerup = up; b.onpointercancel = up; b.onlostpointercapture = up;
  }
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) && t.getAttribute("type") !== "range") return;
    if (current?.session?.key(e)) e.preventDefault();
  };
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKey);
  $("keys").textContent = [...new Set(Object.entries(DEFAULT_KEYS).filter(([, v]) => v === "a" || v === "b").map(([k]) => k))].join(", ");

  // ---- uploads ----
  $("up-folder").onchange = async (/** @type {any} */ e) => {
    const files = /** @type {File[]} */ ([...e.target.files]);
    const entries = await Promise.all(files.map(async (f) => ({ path: f.webkitRelativePath || f.name, content: contentOf(f.webkitRelativePath || f.name, await f.arrayBuffer()) })));
    const g = groupUpload(entries);
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
    if (f) { input.glue = { path: f.name, text: await f.text() }; await loadGlue(); }
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
