// Judges one defineUI declaration. Every problem is a U code at a path inside the declaration, or, inside a lambda,
// at the lambda and a line within it (`line`, which a host that knows the file's text can turn into its own line).

import { didYouMean } from "../codes.js";
import { resolvePath, describe, kindOf } from "./shapes.js";
import { checkLambda } from "./lambda.js";
import { tagOk, definesTag } from "./elements.js";
import { controlProblems, controlSeam, pointerSeam } from "./controls.js";
import { parseSeam, printSeam, compareSeams } from "../../seam/index.js";

/** @import { Type } from "../../ir/ir.js" */

/** The generated views, by id (ui-draft.md, "Generated views"). */
export const VIEWS = ["stage", "text", "params", "traces", "controls", "events", "ir", "graph", "code", "diagnostics", "reference", "presets", "editor", "agent", "book"];
export const ANNOTATABLE = ["traces", "params"];
export const DIRECTIONS = ["splitRight", "splitLeft", "splitAbove", "splitBelow", "tabWith"];
export const TONES = ["good", "warn", "bad", "dim"];
const TOP = ["stage", "controls", "grips", "actions", "tiles", "annotate"];
const ELEMENT_KEYS = ["element", "module"];
/** The kinds of a Grip, and what each needs beside at and to. */
export const GRIP_KINDS = ["translate", "length", "rotate", "scale"];
const GRIP_KEYS = ["each", "at", "to", "kind", "axis", "center", "unit", "step", "label"];
/** What an action gives the host. */
export const GIVES = ["file", "edits"];
const ACTION_KEYS = ["label", "module", "export", "gives"];
/** A param's on-screen looks and curves (annotate.params). */
const PARAM_LOOKS = ["slider", "knob", "field"];
const CURVES = ["linear", "log"];

/** Each component kind: its required and optional keys; a layout takes no element. */
/** @type {Record<string, { req: string[], opt?: string[], layout?: true }>} */
export const KINDS = {
  stat: { req: ["label", "value"], opt: ["unit", "badIf", "max"] },
  check: { req: ["label", "expect"] },
  table: { req: ["label", "rows", "columns"], opt: ["limit"] },
  plot: { req: ["label", "y", "window"] },
  runs: { req: ["label", "param", "from", "to", "steps", "seconds", "y"] },
  text: { req: ["value"] },
  row: { req: ["items"], layout: true },
  col: { req: ["items"], layout: true },
  control: { req: ["control"], layout: true },
  param: { req: ["param"], layout: true },
  action: { req: ["action"], layout: true },
  view: { req: ["draw"], opt: ["pointer"], layout: true },
};

const IDENT = /^[A-Za-z_$][\w$]*$/;
const MODULE_RE = /^\.\/(?!.*\.\.)[\w./-]+\.js$/;

/**
 * @typedef {object} Problem
 * @property {string} code
 * @property {Array<string | number>} path  the path inside the declaration
 * @property {string} message
 * @property {string} tip
 * @property {number} [line]  inside a lambda: the line within it (1-based)
 */

/**
 * @typedef {object} Env
 * @property {string} pkg  the package name (the Dialect's name)
 * @property {Type | null} state  the Dialect's declared state Type (null: it declares none)
 * @property {Record<string, any>} objects  the Dialect's objects
 * @property {Record<string, Record<string, string>>} aliases  the Dialect's vector component aliases, by vector name
 * @property {Set<string>} free  the free names the Dialect gives a lambda
 * @property {Record<string, any>} globalObjects  the object each of the Dialect's globals names, by global name
 * @property {Record<string, { seam: string, draw: boolean, frame: string | null }>} outputs  the Dialect's output ports: each one's printed seam, whether it is a Draw seam, and a Draw seam's frame
 * @property {Record<string, { seam: any, seamText: string }>} inputs  the Dialect's input ports, each with its parsed seam
 * @property {Record<string, any>} files  the Dialect's data files, by name
 * @property {((path: string) => string | null) | null} moduleText  a package file's text, or null when it is not a readable file; the option itself null when the host cannot read files (the module checks are then skipped)
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** A value as it is written in a message; total, whatever the author passed (a BigInt, a cycle, an object with no toString). */
function str(/** @type {unknown} */ v) {
  try { return JSON.stringify(v) ?? String(v); } catch {
    try { return String(v); } catch { return typeof v; }
  }
}

/**
 * @param {unknown} decl @param {Env} env @returns {Problem[]}
 */
export function validate(decl, env) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {string} */ code, /** @type {Array<string | number>} */ path, /** @type {string} */ message, /** @type {string} */ tip) => { out.push({ code, path, message, tip }); };

  /** Unknown keys of `o` (U001, with a did-you-mean) and missing required ones. */
  function keys(/** @type {Record<string, any>} */ o, /** @type {Array<string | number>} */ at, /** @type {string[]} */ allowed, /** @type {string[]} */ required, /** @type {string} */ what) {
    // A misspelled required key is one mistake: its did-you-mean says so, so it is not also reported missing.
    const meant = new Set();
    for (const k of Object.keys(o)) {
      if (allowed.includes(k)) continue;
      if (k === "state" && at.length === 0) { add("U001", [...at, k], "defineUI's declaration has no key 'state': the run's state is declared in the Dialect", "declare it in defineDialect({ ..., state: { score: \"f64\", ... } }), and read it here by path or lambda"); continue; }
      if (k === "inputs" && at.length === 0) { add("U001", [...at, k], "defineUI's declaration has no key 'inputs': a package declares Controls, each named by the Event input it plays", 'write controls: { <input>: { kind: "buttons", buttons: ["<button>", …] } }'); continue; }
      if (k === "emits") { add("U001", [...at, k], `${what} has no key 'emits': a custom element dispatches wb-control, wb-param or wb-edit, which the host checks against the declarations`, "remove emits, and dispatch wb-control ({ control, value }), wb-param or wb-edit from the element"); continue; }
      const mean = didYouMean(k, allowed);
      const m = mean.match(/'(.+)'/);
      if (m) meant.add(m[1]);
      add("U001", [...at, k], `${what} has no key '${k}'.${mean}`, m ? (Object.hasOwn(o, m[1]) ? `remove '${k}': '${m[1]}' is already there` : `write ${m[1]}`) : `use one of: ${allowed.join(", ")}`);
    }
    for (const k of required) if (!(k in o) && !meant.has(k)) add("U001", at, `${what} needs '${k}'`, `add ${k}: …`);
  }

  if (!isObj(decl)) { add("U001", [], "defineUI's second argument is not an object", "pass { stage?, controls?, grips?, actions?, tiles?, annotate? }"); return out; }
  keys(decl, [], TOP, [], "defineUI's declaration");

  /** @type {Type | null} */
  const root = env.state;

  const viewLambda = { params: ["s", "$"], shapes: [root, null], free: env.free, objects: env.globalObjects, aliases: env.aliases };
  /** A lambda's problems, as U007s. */
  function lambda(/** @type {Function} */ fn, /** @type {Array<string | number>} */ at, /** @type {import("./lambda.js").LambdaContext} */ ctx) {
    for (const p of checkLambda(fn, ctx)) out.push({ code: "U007", path: at, message: p.message, tip: p.fix, line: p.line });
  }
  /** A value: a path of one of `kinds`, or a view lambda. */
  function value(/** @type {unknown} */ v, /** @type {Array<string | number>} */ at, /** @type {string[]} */ kinds) {
    const key = String(at.at(-1));
    if (typeof v === "function") return lambda(v, at, viewLambda);
    if (typeof v !== "string") return add("U012", at, `${key} is ${str(v)}; it takes a path or a lambda`, `write a path such as "t", or a lambda (s, $) => …`);
    if (!root) return;
    const r = resolvePath(root, v, env.aliases);
    if ("error" in r) return add("U005", at, r.error, r.fix);
    const got = kindOf(r.type);
    if (!kinds.includes(got)) add("U005", at, `'${v}' is ${describe(got)}; ${key} takes ${kinds.map((k) => (k === "list" ? "a list" : `a ${k}`)).join(" or ")}`, `name a path to ${kinds.join(" or ")}, or write a lambda`);
  }
  const string = (/** @type {unknown} */ v, /** @type {Array<string | number>} */ at) => { if (typeof v !== "string") add("U012", at, `${at.at(-1)} is ${str(v)}, not a string`, `write ${String(at.at(-1))}: "…"`); };
  /** A number in lo..hi (whole if asked); `lo` excluded when `open`. */
  function number(/** @type {unknown} */ v, /** @type {Array<string | number>} */ at, /** @type {number} */ lo, /** @type {number} */ hi, /** @type {{ whole?: boolean, open?: boolean }} */ o = {}) {
    const key = at.at(-1);
    if (typeof v !== "number" || !Number.isFinite(v) || (o.whole && !Number.isInteger(v)) || (o.open ? v <= lo : v < lo) || v > hi) {
      add("U012", at, `${key} is ${str(v)}; it takes ${o.whole ? "a whole number" : "a number"} ${o.open ? `more than ${lo}` : `from ${lo}`}${hi === Infinity ? "" : ` to ${hi}`}`, `write ${String(key)}: ${o.open ? lo + 1 : lo}`);
    }
  }

  // custom elements, on the stage and on components
  /** @type {Map<string, string>} */
  const tags = new Map();
  function element(/** @type {Record<string, any>} */ o, /** @type {Array<string | number>} */ at) {
    if (!("element" in o)) {
      if ("module" in o) add("U008", [...at, "module"], "a module without an element", `add element: "${env.pkg}-<name>"`);
      return;
    }
    const tag = o.element;
    const prefix = `${env.pkg.toLowerCase()}-`;
    const isTag = tagOk(tag, prefix);
    if (!isTag) {
      add("U008", [...at, "element"], `${str(tag)} is not a custom element tag under the package's prefix '${prefix}'`, `write element: "${prefix}<name>" (lowercase, with a hyphen, starting with the package name)`);
    } else if (tags.has(tag)) {
      add("U008", [...at, "element"], `the tag '${tag}' is used twice (first at ${tags.get(tag)})`, "give each element its own tag");
    } else tags.set(tag, at.join("."));
    const mod = o.module;
    if (!("module" in o)) add("U008", [...at, "element"], `the element ${str(tag)} has no module`, `add module: "./${typeof tag === "string" ? tag : "<file>"}.js", a package file that defines it`);
    else if (typeof mod !== "string" || !MODULE_RE.test(mod)) add("U008", [...at, "module"], `${str(mod)} is not one of the package's files`, `write module: "./<file>.js"`);
    else if (env.moduleText) {
      const text = env.moduleText(mod);
      if (text === null) add("U008", [...at, "module"], `the module '${mod}' is not a readable file in the package`, `write ${mod}, an ES module that calls customElements.define("${tag}", …)`);
      else if (isTag && !definesTag(text, /** @type {string} */ (tag))) add("U008", [...at, "module"], `'${mod}' does not call customElements.define("${tag}", …)`, `define the tag in ${mod}: customElements.define("${tag}", class extends HTMLElement { … })`);
    }
  }

  /** The Draw outputs, by name. */
  const drawn = Object.entries(env.outputs).filter(([, o]) => o.draw).map(([n]) => n);
  /** The Event inputs, by name. */
  const events = Object.entries(env.inputs).filter(([, i]) => i.seam?.kind === "event").map(([n]) => n);

  // stage
  if ("stage" in decl) {
    if (!isObj(decl.stage)) add("U012", ["stage"], "stage is not an object", 'write stage: { element: "<pkg>-<name>", module: "./<file>.js" }, or stage: { draw: "<output>" }, or leave it out for the text view');
    else if ("draw" in decl.stage) drawStage(decl.stage);
    else {
      keys(decl.stage, ["stage"], [...ELEMENT_KEYS, "draw", "pointer"], ["element"], "stage");
      element(decl.stage, ["stage"]);
      if ("pointer" in decl.stage) add("U014", ["stage", "pointer"], "a pointer goes with a Draw stage: the kit maps the pointer into a Draw output's frame, and a custom element handles its own", 'show a Draw output, stage: { draw: "<output>", pointer: "<input>" }, or dispatch wb-control from the element');
    }
  }
  /**
   * A pointer input on a Draw output: an Event input of the Dialect (U015) whose seam is the pointer's, in the
   * output's frame (U016, printing the seam to copy).
   * @param {unknown} input @param {string} output @param {Array<string | number>} at
   */
  function pointer(input, output, at) {
    const frame = env.outputs[output]?.frame;
    if (!frame) return;
    const want = pointerSeam(frame);
    if (typeof input !== "string" || !Object.hasOwn(env.inputs, input) || env.inputs[input].seam?.kind !== "event") {
      return add("U015", at, `the pointer names ${str(input)}, which is not an Event input of the ${env.pkg} Dialect.${typeof input === "string" ? didYouMean(input, events) : ""}`, `declare it in ports.in: ${typeof input === "string" ? input : "pointer"}: { seam: "${want}", note: "the pointer on the stage" }`);
    }
    const have = printSeam(env.inputs[input].seam);
    if (have !== want) add("U016", at, `in.${input} is ${have}, not the pointer's seam on out.${output} (frame ${frame})`, `write its seam as ${want}`);
  }
  /** The third form: the Dialect's own Draw output, by name. */
  function drawStage(/** @type {Record<string, any>} */ st) {
    const drawn = Object.entries(env.outputs).filter(([, s]) => s.draw).map(([n]) => n);
    const tip = drawn.length ? drawn.map((n) => `draw: "${n}"`).join(", or ") : `declare a Draw output in defineDialect's ports.out (seam: "Draw<max>@<frame>"), or use a custom element`;
    const mixed = Object.keys(st).filter((k) => ELEMENT_KEYS.includes(k));
    if (mixed.length) add("U014", ["stage"], `a stage is a custom element or a Draw output, not both: it has draw and ${mixed.join(", ")}`, "keep draw, or keep element and module");
    keys(st, ["stage"], ["draw", "pointer", ...ELEMENT_KEYS], ["draw"], "stage");
    const name = st.draw;
    if (typeof name !== "string") return add("U014", ["stage", "draw"], `draw is ${str(name)}; it names one of the ${env.pkg} Dialect's Draw outputs`, tip);
    if (!Object.hasOwn(env.outputs, name)) return add("U014", ["stage", "draw"], `the ${env.pkg} Dialect has no output '${name}'.${didYouMean(name, Object.keys(env.outputs))}`, tip);
    const o = env.outputs[name];
    if (!o.draw) return add("U014", ["stage", "draw"], `out.${name} is ${o.seam}, not a Draw seam: the stage draws a Draw output`, tip);
    if ("pointer" in st) pointer(st.pointer, name, ["stage", "pointer"]);
  }

  // controls
  const controlNames = isObj(decl.controls) ? Object.keys(decl.controls) : [];
  if ("controls" in decl) {
    if (!isObj(decl.controls)) add("U012", ["controls"], "controls is not an object of Controls by name", 'write controls: { <input>: { kind: "<kind>", … } }');
    else for (const [n, c] of Object.entries(decl.controls)) control(n, c);
  }
  /** One Control: its declaration (U017), then its binding by name to the Event input it plays (U015, U016). */
  function control(/** @type {string} */ n, /** @type {unknown} */ c) {
    const at = ["controls", n];
    const before = out.length;
    out.push(...controlProblems(c, at, { files: env.files }));
    if (out.length > before || !isObj(c)) return;
    const input = Object.hasOwn(env.inputs, n) ? env.inputs[n] : null;
    if (!input || input.seam?.kind !== "event") {
      if (c.to !== undefined || c.each !== undefined) {
        if (input) add("U015", at, `'${n}' is a value input of the ${env.pkg} Dialect, not an Event input: a Control with that name would play it`, `rename the Control, or make in.${n} an Event input`);
        return;
      }
      if (input) return add("U015", at, `the Control '${n}' names in.${n}, a value input (${input.seamText}); a Control plays an Event input`, `declare in.${n} as an Event input, Event<{ … }>, or give the Control a to ("param.<name>" or "arg.<address>") and another name`);
      return add("U015", at, `the Control '${n}' names no Event input of the ${env.pkg} Dialect.${didYouMean(n, events)} Its Event inputs: ${events.join(", ") || "none"}`, `name an Event input, or give it to: "param.<name>" or "arg.<address>" to make it part-local`);
    }
    const text = controlSeam(c);
    const parsed = /** @type {any} */ (parseSeam(text));
    if (!parsed.ok) return add("U017", at, `the Control '${n}' makes no seam: ${parsed.error}`, "check its buttons, options and carry");
    const cmp = compareSeams(parsed.type, input.seam);
    if (c.each !== undefined && !Object.hasOwn(input.seam.of?.fields ?? {}, "key")) cmp.problems.push(/** @type {any} */ ({ code: "S202", field: "key", message: "a keyed Control (each) sends key: str, which the input does not take" }));
    if (cmp.problems.length) add("U016", at, `the Control '${n}' sends ${printSeam(parsed.type)}, and in.${n} takes ${input.seamText}: ${cmp.problems.map((/** @type {any} */ p) => p.message).join("; ")}`, `change the Control's kind or keys, or in.${n}'s seam, so the record fits${c.each !== undefined ? " (a keyed Control's record has key: str)" : ""}`);
  }

  // grips
  if ("grips" in decl) {
    if (!isObj(decl.grips)) add("U012", ["grips"], "grips is not an object of Grips by name", "write grips: { <grip>: { kind, at, to, … } }");
    else for (const [n, g] of Object.entries(decl.grips)) grip(n, g);
  }
  function grip(/** @type {string} */ n, /** @type {unknown} */ g) {
    const at = ["grips", n];
    const bad = (/** @type {Array<string | number>} */ p, /** @type {string} */ m, /** @type {string} */ tip) => add("U018", p, m, tip);
    if (!isObj(g)) return bad(at, `the Grip '${n}' is ${str(g)}, not an object`, "write { kind, at, to }");
    const top = /** @type {Record<string, any>} */ (decl);
    const hasDraw = isObj(top.stage) && typeof top.stage.draw === "string";
    if (!hasDraw) bad(at, `the Grip '${n}' needs a Draw stage: the host draws a Grip over the stage's Draw output, in its frame`, 'show a Draw output: stage: { draw: "<output>" }');
    for (const k of Object.keys(g)) if (!GRIP_KEYS.includes(k)) bad([...at, k], `a Grip has no key '${k}'.${didYouMean(k, GRIP_KEYS)}${k === "min" || k === "max" ? " A Grip's range is its target's own: the Grammar's bounds or the param's min and max" : ""}`, `use: ${GRIP_KEYS.join(", ")}`);
    for (const k of ["at", "to", "kind"]) if (!(k in g)) bad(at, `the Grip '${n}' needs '${k}'`, `add ${k}: …`);
    if ("kind" in g && !GRIP_KINDS.includes(g.kind)) bad([...at, "kind"], `${str(g.kind)} is not a Grip kind.${typeof g.kind === "string" ? didYouMean(g.kind, GRIP_KINDS) : ""}`, `use one of: ${GRIP_KINDS.join(", ")}`);
    if (g.kind === "length" && !("axis" in g)) bad(at, `a length Grip needs axis: where one unit of the value moves it`, "add axis: (<item>, s, $) => [<dx>, <dy>]");
    if ((g.kind === "rotate" || g.kind === "scale") && !("center" in g)) bad(at, `a ${g.kind} Grip needs center`, "add center: (<item>, s, $) => [<x>, <y>]");
    if ("unit" in g && g.unit !== "deg" && g.unit !== "rad") bad([...at, "unit"], `unit is ${str(g.unit)}; it is "deg" or "rad"`, 'write unit: "deg"');
    if ("step" in g && !(typeof g.step === "number" && g.step > 0)) bad([...at, "step"], `step is ${str(g.step)}; it takes a number above 0`, "write step: 1");
    if ("label" in g) string(g.label, [...at, "label"]);
    /** @type {Type | null} */
    let item = null;
    if ("each" in g) {
      if (typeof g.each !== "string") bad([...at, "each"], `each is ${str(g.each)}; it names a state list with a max`, 'write each: "<list>"');
      else if (root) {
        const r = resolvePath(root, g.each, env.aliases);
        if ("error" in r) bad([...at, "each"], r.error, r.fix);
        else if (kindOf(r.type) !== "list") bad([...at, "each"], `'${g.each}' is ${describe(kindOf(r.type))}; each names a state list with a max`, "name a list in the Dialect's state");
        else item = /** @type {any} */ (typeof r.type === "object" && "opt" in r.type ? r.type.opt : r.type).list;
      }
    }
    for (const k of ["at", "to", "axis", "center"]) {
      if (!(k in g)) continue;
      if (typeof g[k] !== "function") { bad([...at, k], `${k} is ${str(g[k])}, not a lambda`, `write ${k}: ${"each" in g ? "(<item>, s, $)" : "(s, $)"} => …`); continue; }
      lambda(g[k], [...at, k], "each" in g ? { params: ["item", "s", "$"], shapes: [item, root, null], free: env.free, objects: env.globalObjects, aliases: env.aliases } : viewLambda);
    }
  }

  // actions
  if ("actions" in decl) {
    if (!isObj(decl.actions)) add("U012", ["actions"], "actions is not an object of actions by name", 'write actions: { <action>: { label, module: "./<file>.js", export: "<name>", gives: "file" } }');
    else for (const [n, a] of Object.entries(decl.actions)) action(n, a);
  }
  function action(/** @type {string} */ n, /** @type {unknown} */ a) {
    const at = ["actions", n];
    const bad = (/** @type {Array<string | number>} */ p, /** @type {string} */ m, /** @type {string} */ tip) => add("U019", p, m, tip);
    if (!isObj(a)) return bad(at, `the action '${n}' is ${str(a)}, not an object`, 'write { label, module: "./<file>.js", export: "<name>", gives: "file" }');
    for (const k of Object.keys(a)) if (!ACTION_KEYS.includes(k)) bad([...at, k], `an action has no key '${k}'.${didYouMean(k, ACTION_KEYS)}`, `use: ${ACTION_KEYS.join(", ")}`);
    for (const k of ACTION_KEYS) if (!(k in a)) bad(at, `the action '${n}' needs '${k}'`, `add ${k}: …`);
    if ("label" in a && typeof a.label !== "string") bad([...at, "label"], `label is ${str(a.label)}, not a string`, 'write label: "…"');
    const modOk = typeof a.module === "string" && MODULE_RE.test(a.module);
    if ("module" in a && !modOk) bad([...at, "module"], `${str(a.module)} is not one of the package's files: a module is "./<file>.js"`, 'write module: "./<file>.js"');
    const expOk = typeof a.export === "string" && IDENT.test(a.export);
    if ("export" in a && !expOk) bad([...at, "export"], `${str(a.export)} is not an export's name: it is an identifier`, 'write export: "<name>"');
    if ("gives" in a && !GIVES.includes(a.gives)) bad([...at, "gives"], `gives is ${str(a.gives)}; an action gives "file" or "edits"`, 'write gives: "file"');
    if (modOk && expOk && env.moduleText) {
      const text = env.moduleText(a.module);
      if (text === null) bad([...at, "module"], `the module '${a.module}' is not a readable file in the package`, `write ${a.module}, an ES module that exports ${a.export}`);
      else if (!exportsName(text, a.export)) bad([...at, "export"], `'${a.module}' has no export '${a.export}'`, `export it from ${a.module}: export function ${a.export}({ record, state, params, files, signal, progress, pause }) { … }`);
    }
  }

  // tiles
  /** @type {Map<string, string>} tile → the tile it is placed against */
  const edges = new Map();
  const tileIds = isObj(decl.tiles) ? Object.keys(decl.tiles) : [];
  if ("tiles" in decl) {
    if (!isObj(decl.tiles)) add("U012", ["tiles"], "tiles is not an object of tiles by id", "write tiles: { health: { title, place, body } }");
    else for (const [id, t] of Object.entries(decl.tiles)) tile(id, t);
    /** Tiles already reported in a cycle, so one cycle is one diagnostic. @type {Set<string>} */
    const cycled = new Set();
    for (const id of edges.keys()) {
      if (cycled.has(id)) continue;
      const seen = [id];
      for (let cur = edges.get(id); cur !== undefined; cur = edges.get(cur)) {
        if (cur === id) { seen.forEach((t) => cycled.add(t)); add("U003", ["tiles", id, "place"], `the tiles are placed in a cycle: ${[...seen, id].join(" → ")}`, "place one of them against a generated view such as stage"); break; }
        if (seen.includes(cur)) break;
        seen.push(cur);
      }
    }
  }
  function tile(/** @type {string} */ id, /** @type {unknown} */ t) {
    const at = ["tiles", id];
    if (!IDENT.test(id) || VIEWS.includes(id)) add("U011", at, VIEWS.includes(id) ? `the tile id '${id}' is a generated view's id` : `the tile id '${id}' is not an identifier`, `rename the tile, say '${IDENT.test(id) ? `my${id[0].toUpperCase()}${id.slice(1)}` : "panel"}'`);
    if (!isObj(t)) return add("U012", at, `the tile '${id}' is not an object`, "write { title, place, body }");
    keys(t, at, ["title", "place", "body"], ["title", "place", "body"], `the tile '${id}'`);
    if ("title" in t) string(t.title, [...at, "title"]);
    if ("place" in t) place(id, t.place, [...at, "place"]);
    if ("body" in t) components(t.body, [...at, "body"]);
  }
  /** A view or tile id named in a place or an annotate key; null (and a U003) when it is qualified: this page holds one package, so every qualified id is an error (ui-draft.md, "Naming"). */
  function local(/** @type {string} */ name, /** @type {Array<string | number>} */ at) {
    const dot = name.indexOf(".");
    if (dot < 0) return name;
    const own = name.slice(0, dot) === env.pkg;
    add("U003", at, own ? `'${name}' is qualified; this page holds only '${env.pkg}', so name its views and tiles bare` : `'${name}' names another package's view; this page holds only '${env.pkg}'`, `name your own view or tile: ${name.slice(dot + 1)}`);
    return null;
  }
  function place(/** @type {string} */ id, /** @type {unknown} */ p, /** @type {Array<string | number>} */ at) {
    if (!isObj(p)) return add("U004", at, `place is ${str(p)}, not an object`, 'write place: { splitRight: "stage" }');
    keys(p, at, [...DIRECTIONS, "size"], [], "place");
    const dirs = Object.keys(p).filter((k) => DIRECTIONS.includes(k));
    // An unknown key is most likely the direction misspelled: its U001 says so, so no second "no direction".
    if (dirs.length === 0 && Object.keys(p).some((k) => k !== "size")) return;
    if (dirs.length !== 1) return add("U004", at, dirs.length ? `place has ${dirs.length} directions (${dirs.join(", ")})` : "place has no direction", `use exactly one of ${DIRECTIONS.join(", ")}`);
    const dir = dirs[0];
    const target = p[dir];
    if (typeof target !== "string") add("U003", [...at, dir], `${dir} is ${str(target)}; it names a view or a tile`, `write ${dir}: "stage"`);
    else {
      const name = local(target, [...at, dir]);
      if (name !== null) {
        if (VIEWS.includes(name)) { /* a generated view */ } else if (tileIds.includes(name)) edges.set(id, name);
        else add("U003", [...at, dir], `'${target}' is no view or tile.${name === "pad" ? " Did you mean 'controls'? The generated view pad is now controls, the page's Controls." : didYouMean(name, [...VIEWS, ...tileIds])}`, `name a generated view (${VIEWS.join(", ")}) or one of your tiles`);
      }
    }
    if ("size" in p) {
      if (dir === "tabWith") add("U004", [...at, "size"], "size goes with a split, not tabWith (a tab takes the whole of its group)", "remove size");
      else if (typeof p.size !== "number" || !(p.size >= 0.1 && p.size <= 0.9)) add("U004", [...at, "size"], `size is ${str(p.size)}; it takes 0.1 to 0.9`, "write size: 0.3");
    }
  }
  function components(/** @type {unknown} */ list, /** @type {Array<string | number>} */ at) {
    if (!Array.isArray(list) || list.length === 0) return add("U012", at, `${at.at(-1)} is ${Array.isArray(list) ? "empty" : str(list)}; it takes a list of one or more components`, `write ${String(at.at(-1))}: [{ kind: "stat", label: "…", value: "…" }]`);
    list.forEach((c, i) => component(c, [...at, i]));
  }
  function component(/** @type {unknown} */ c, /** @type {Array<string | number>} */ at) {
    if (!isObj(c)) return add("U012", at, `${str(c)} is not a component`, 'write { kind: "stat", label, value }');
    if (!("kind" in c)) return add("U001", at, "a component needs 'kind'", `add kind: one of ${Object.keys(KINDS).join(", ")}`);
    const spec = KINDS[c.kind];
    if (!spec || !Object.hasOwn(KINDS, c.kind)) return add("U002", [...at, "kind"], `${str(c.kind)} is not a component kind.${typeof c.kind === "string" ? didYouMean(c.kind, Object.keys(KINDS)) : ""}`, `use one of: ${Object.keys(KINDS).join(", ")}`);
    keys(c, at, ["kind", ...spec.req, ...(spec.opt ?? []), ...(spec.layout ? [] : ELEMENT_KEYS)], spec.req, `a ${c.kind}`);
    const k = (/** @type {string} */ key) => [...at, key];
    if ("label" in c) string(c.label, k("label"));
    if ("unit" in c) string(c.unit, k("unit"));
    if (c.kind === "stat" && "value" in c) value(c.value, k("value"), ["number", "string"]);
    if (c.kind === "stat" && "max" in c) value(c.max, k("max"), ["number"]);
    if ("badIf" in c) value(c.badIf, k("badIf"), ["boolean"]);
    if ("expect" in c) value(c.expect, k("expect"), ["boolean"]);
    if ("y" in c) value(c.y, k("y"), ["number"]);
    if (c.kind === "text" && "value" in c && typeof c.value !== "function") string(c.value, k("value"));
    if (c.kind === "text" && typeof c.value === "function") lambda(c.value, k("value"), viewLambda);
    if ("window" in c) number(c.window, k("window"), 0, Infinity, { open: true });
    if ("limit" in c) number(c.limit, k("limit"), 1, 1000, { whole: true });
    if ("steps" in c) number(c.steps, k("steps"), 2, 50, { whole: true });
    if ("seconds" in c) number(c.seconds, k("seconds"), 0, 3600, { open: true });
    if ("param" in c && (typeof c.param !== "string" || !IDENT.test(c.param))) add("U012", k("param"), `param is ${str(c.param)}; it takes a param's name`, 'write param: "rate"');
    if (c.kind === "control" && "control" in c && !controlNames.includes(c.control)) add("U020", k("control"), `${str(c.control)} names no Control of this UI.${typeof c.control === "string" ? didYouMean(c.control, controlNames) : ""}`, controlNames.length ? `name one of: ${controlNames.join(", ")}` : "declare it under controls");
    if (c.kind === "action" && "action" in c) {
      const top = /** @type {Record<string, any>} */ (decl);
      const actions = isObj(top.actions) ? Object.keys(top.actions) : [];
      if (!actions.includes(c.action)) add("U020", k("action"), `${str(c.action)} names no action of this UI.${typeof c.action === "string" ? didYouMean(c.action, actions) : ""}`, actions.length ? `name one of: ${actions.join(", ")}` : "declare it under actions");
    }
    if (c.kind === "view" && "draw" in c) {
      if (typeof c.draw !== "string" || !Object.hasOwn(env.outputs, c.draw)) add("U014", k("draw"), `a view draws ${str(c.draw)}, which is not an output of the ${env.pkg} Dialect.${typeof c.draw === "string" ? didYouMean(c.draw, drawn) : ""}`, drawn.length ? `name a Draw output: ${drawn.join(", ")}` : "declare a Draw output in ports.out");
      else if (!env.outputs[c.draw].draw) add("U014", k("draw"), `out.${c.draw} is ${env.outputs[c.draw].seam}, not a Draw seam: a view draws a Draw output`, drawn.length ? `name a Draw output: ${drawn.join(", ")}` : "declare a Draw output in ports.out");
      else if ("pointer" in c) pointer(c.pointer, c.draw, k("pointer"));
    }
    if (c.kind === "runs") {
      if ("from" in c) number(c.from, k("from"), -Infinity, Infinity);
      if ("to" in c) number(c.to, k("to"), -Infinity, Infinity);
      if (typeof c.from === "number" && typeof c.to === "number" && !(c.from < c.to)) add("U012", k("to"), `from ${c.from} is not less than to ${c.to}`, "write from below to");
    }
    if (c.kind === "table") table(c, at);
    if ("items" in c) components(c.items, k("items"));
    if (!spec.layout) element(c, at);
  }
  function table(/** @type {Record<string, any>} */ c, /** @type {Array<string | number>} */ at) {
    /** @type {Type | null} */
    let row = null;
    if ("rows" in c) {
      if (typeof c.rows !== "string") add("U012", [...at, "rows"], `rows is ${str(c.rows)}; it takes a path to a list in state`, 'write rows: "emitters"');
      else if (root) {
        const r = resolvePath(root, c.rows, env.aliases);
        if ("error" in r) add("U005", [...at, "rows"], r.error, r.fix);
        else if (kindOf(r.type) !== "list") add("U005", [...at, "rows"], `'${c.rows}' is ${describe(kindOf(r.type))}; rows takes a list`, "name a list in state");
        else {
          const item = /** @type {any} */ (typeof r.type === "object" && "opt" in r.type ? r.type.opt : r.type).list;
          row = item;
        }
      }
    }
    if (!("columns" in c)) return;
    if (!Array.isArray(c.columns) || c.columns.length === 0) return add("U012", [...at, "columns"], "columns is not a list of one or more columns", 'write columns: ["name", { label: "share", value: (row, s) => … }]');
    for (const [i, col] of c.columns.entries()) {
      const cat = [...at, "columns", i];
      if (typeof col === "string") {
        const fields = row && kindOf(row) === "object" ? /** @type {Record<string, Type>} */ (/** @type {any} */ (typeof row === "object" && "opt" in row ? row.opt : row).struct) : null;
        if (fields && !Object.hasOwn(fields, col)) add("U005", cat, `the rows of '${c.rows}' have no key '${col}'.${didYouMean(col, Object.keys(fields))}`, `use one of: ${Object.keys(fields).join(", ")}`);
        else if (row && !fields) add("U005", cat, `the rows of '${c.rows}' are ${describe(kindOf(row))}, which has no keys`, '{ label, value: (row) => row } shows the item itself');
      } else if (isObj(col) && Object.keys(col).length === 2 && typeof col.label === "string" && typeof col.value === "function") {
        lambda(col.value, [...cat, "value"], { params: ["row", "s", "$"], shapes: [row, root, null], free: env.free, objects: env.globalObjects, aliases: env.aliases });
      } else add("U012", cat, `${typeof col === "function" ? "a bare lambda" : str(col)} is not a column`, 'write a row key ("live") or { label: "share", value: (row, s, $) => … }');
    }
  }

  // annotate
  if ("annotate" in decl) {
    if (!isObj(decl.annotate)) add("U012", ["annotate"], "annotate is not an object", "write annotate: { traces: { … }, params: { … } }");
    else for (const [viewName, marks] of Object.entries(decl.annotate)) annotate(viewName, marks);
  }
  function annotate(/** @type {string} */ viewName, /** @type {unknown} */ marks) {
    const at = ["annotate", viewName];
    const view = local(viewName, at);
    if (view === null) return;
    if (!ANNOTATABLE.includes(view)) {
      return add("U003", at, VIEWS.includes(view) ? `the view '${view}' takes no annotations` : `'${viewName}' is no view.${didYouMean(view, ANNOTATABLE)}`, `annotate ${ANNOTATABLE.join(" or ")}`);
    }
    if (!isObj(marks)) return add("U012", at, `annotate.${viewName} is not an object of annotations by key`, `write ${viewName}: { <key>: { note: "…" } }`);
    for (const [key, a] of Object.entries(marks)) {
      const kat = [...at, key];
      if (view === "traces" && root) {
        const r = resolvePath(root, key, env.aliases);
        if ("error" in r) add("U005", kat, r.error, r.fix);
        else if (kindOf(r.type) !== "number") add("U005", kat, `'${key}' is ${describe(kindOf(r.type))}; a trace is a number in state`, "annotate a number's path");
      }
      if (view === "params" && key !== "*" && !IDENT.test(key)) add("U012", kat, `'${key}' is not a param name`, 'key it by a param name, or "*" for every param');
      if (!isObj(a)) { add("U012", kat, `the annotation '${key}' is not an object`, 'write { note: "…" }'); continue; }
      const marks = view === "params" ? ["note", "badge", "tone", "look", "curve", "step"] : ["note", "badge", "tone"];
      keys(a, kat, marks, [], `the annotation '${key}'`);
      if (!marks.some((m) => m in a)) add("U001", kat, `the annotation '${key}' has none of ${marks.join(", ")}`, 'add note: "…"');
      if ("look" in a && !PARAM_LOOKS.includes(a.look)) add("U012", [...kat, "look"], `look is ${str(a.look)}; a param looks like ${PARAM_LOOKS.join(", ")}`, 'write look: "knob"');
      if ("curve" in a && !CURVES.includes(a.curve)) add("U012", [...kat, "curve"], `curve is ${str(a.curve)}; it is "linear" or "log"`, 'write curve: "log"');
      if ("step" in a && !(typeof a.step === "number" && Number.isFinite(a.step) && a.step > 0)) add("U012", [...kat, "step"], `step is ${str(a.step)}; it takes a number above 0`, "write step: 0.1");
      if ("note" in a) string(a.note, [...kat, "note"]);
      if ("badge" in a) { if (typeof a.badge === "function") lambda(a.badge, [...kat, "badge"], viewLambda); else string(a.badge, [...kat, "badge"]); }
      if ("tone" in a) {
        if (typeof a.tone === "function") lambda(a.tone, [...kat, "tone"], viewLambda);
        else if (!TONES.includes(a.tone)) add("U012", [...kat, "tone"], `${str(a.tone)} is not a tone.${typeof a.tone === "string" ? didYouMean(a.tone, TONES) : ""}`, `use one of: ${TONES.join(", ")}`);
      }
    }
  }
  return out;
}

/**
 * Whether a module's text exports `name`: a function, class or binding declared with export, or a name in an
 * export list (`export { a, b as name }`). A text check, as the custom element check is.
 * @param {string} text @param {string} name
 */
export function exportsName(text, name) {
  const n = name.replace(/\$/g, "\\$");
  if (new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\s*\\*?|class|const|let|var)\\s+${n}\\b`).test(text)) return true;
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) { const bits = part.trim().split(/\s+as\s+/); if ((bits[1] ?? bits[0]).trim() === name) return true; }
  }
  return false;
}
