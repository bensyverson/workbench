// A package's manifest `tests` (README.md, "Tests"): each is a run of one of its examples alone, timed records on its
// Event inputs, and what to expect. This file judges them as far as no run is needed: their shape from the manifest text
// alone (`testsShape`, K002, which checkManifest reports), their names and records against the loaded Dialect
// (`checkTests`, K020 and K021), and reads a state path and compares values (`readStatePath`, `sameData`), which kit/page's
// `runTests` uses to check what a run did. kit/page runs them: kit/package never imports kit/run.

import { fromNumber, MAX_DENOMINATOR } from "../define/rational.js";
import { extensibleOf } from "../define/state.js";
import { fillDefaults, valueProblem } from "../seam/index.js";
import { diag } from "./codes.js";
import { MANIFEST_PATH } from "./manifest.js";

/** @import { PackageDiagnostic } from "./package.js" */

const TEST_KEYS = ["name", "example", "inputs", "expect", "until", "seed"];
const INPUT_KEYS = ["T", "in", "value"];
const NAME = /^[a-z][a-z0-9-]*$/;
const KINDS = /** @type {const} */ (["state", "output", "events", "diagnostic"]);
const EXPECT_KEYS = { state: ["at", "state", "within"], output: ["at", "output", "value", "within"], events: ["events", "from", "to", "records", "count", "within"], diagnostic: ["diagnostic", "at"] };
const COMPONENTS = ["x", "y", "z", "w", "r", "g", "b", "a"];

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** A stamp as seconds, or null when it is not one a run can stamp: a number with a denominator up to a million, or "<n>/<d>" with <d> up to a million. @param {unknown} t */
export function stampOf(t) {
  if (typeof t === "number") return Number.isFinite(t) && t >= 0 && fromNumber(t) ? t : null;
  if (typeof t === "string" && /^\d+\/[1-9]\d*$/.test(t)) { const [n, d] = t.split("/").map(Number); return d <= MAX_DENOMINATOR ? n / d : null; }
  return null;
}

/**
 * The problems of the manifest's `tests` that the manifest text alone shows, each { message, fix }, the test named in it.
 * @param {unknown} tests @param {Record<string, any>} manifest
 * @returns {Array<{ message: string, fix: string }>}
 */
export function testsShape(tests, manifest) {
  /** @type {Array<{ message: string, fix: string }>} */
  const out = [];
  if (!Array.isArray(tests)) return [{ message: `"tests" must be an array of tests`, fix: `write "tests": [{ "name": "<test>", "example": "<example>.js", "inputs": [], "expect": [] }]` }];
  if (tests.length && typeof manifest.entry?.runtime !== "string") out.push({ message: `"tests" needs a runtime: only a runtime runs, and "entry.runtime" names none`, fix: `add "entry": { "runtime": "<package>.runtime.js" }, or remove "tests"` });
  const examples = Array.isArray(manifest.examples) ? manifest.examples : [];
  const refusals = Array.isArray(manifest.refusals) ? manifest.refusals.map((/** @type {any} */ r) => r?.module) : [];
  const seen = new Set();
  tests.forEach((t, i) => {
    if (!isObject(t)) { out.push({ message: `tests[${i}] must be an object`, fix: `write { "name": "<test>", "example": "<example>.js", "inputs": [], "expect": [] }` }); return; }
    const name = typeof t.name === "string" && t.name !== "" ? t.name : `tests[${i}]`;
    /** @param {string} message @param {string} [fix] */
    const bad = (message, fix = "see the manifest's Tests section in kit/package/README.md") => out.push({ message: `test ${name}: ${message}`, fix });
    for (const k of Object.keys(t)) if (!TEST_KEYS.includes(k)) bad(`unknown key "${k}"`, `a test has ${TEST_KEYS.join(", ")}`);
    if (typeof t.name !== "string" || !NAME.test(t.name)) bad(`"name" is required: lowercase words and digits joined by hyphens, such as "<input>-<does-what>"`, `write "name": "<input>-<does-what>"`);
    else if (seen.has(t.name)) bad(`two tests are named "${t.name}"`, "give each test its own name; every failure names it");
    else seen.add(t.name);
    if (typeof t.example !== "string" || !examples.includes(t.example)) bad(`"example" ${JSON.stringify(t.example)} is not one of the manifest's examples (${examples.join(", ") || "none"})${refusals.includes(t.example) ? "; a refusal is not run" : ""}`, `name one of "examples"`);
    if (!Array.isArray(t.inputs)) bad(`"inputs" is required: an array of { T, in, value }, possibly empty`, `write "inputs": []`);
    else {
      let last = -1;
      t.inputs.forEach((/** @type {unknown} */ x, /** @type {number} */ j) => {
        if (!isObject(x)) { bad(`inputs[${j}] must be { T, in, value }`); return; }
        for (const k of Object.keys(x)) if (!INPUT_KEYS.includes(k)) bad(`inputs[${j}] has an unknown key "${k}"; an input is { T, in, value }`);
        const s = stampOf(x.T);
        if (s === null) bad(`inputs[${j}].T must be a stamp: seconds, a number at least 0 (a fraction with a denominator up to a million) or "<n>/<d>", not ${JSON.stringify(x.T)}`);
        else { if (s < last) bad(`inputs[${j}].T (${JSON.stringify(x.T)}) comes before the input before it: a log is in order`, "list the inputs by stamp; two at one stamp apply in the order written"); last = Math.max(last, s); }
        if (typeof x.in !== "string" || x.in === "") bad(`inputs[${j}].in must name an Event input of the Dialect`);
        if (!("value" in x)) bad(`inputs[${j}] has no value: the record, in the input's own seam`, `write "value": {} (a whole record when every field has a default)`);
        else if (!isObject(x.value)) bad(`inputs[${j}].value must be one record, an object`);
      });
    }
    if (!Array.isArray(t.expect) || t.expect.length === 0) bad(`"expect" is required with at least one expectation: a test that expects nothing tests nothing`, `add an entry such as { "at": <seconds>, "state": { "<path>": <value> } }`);
    else t.expect.forEach((/** @type {unknown} */ e, /** @type {number} */ j) => {
      if (!isObject(e)) { bad(`expect[${j}] must be an object`); return; }
      const kinds = KINDS.filter((k) => k in e);
      if (kinds.length !== 1) { bad(`expect[${j}] has ${kinds.length ? `two kinds (${kinds.join(", ")})` : "no kind"}: give exactly one of ${KINDS.join(", ")}`); return; }
      const kind = kinds[0];
      for (const k of Object.keys(e)) if (!EXPECT_KEYS[kind].includes(k)) bad(`expect[${j}] (${kind}) has an unknown key "${k}"; it takes ${EXPECT_KEYS[kind].join(", ")}`);
      const needStamp = (/** @type {string} */ k) => { if (stampOf(e[k]) === null) bad(`expect[${j}].${k} must be a stamp, not ${JSON.stringify(e[k])}`); };
      if (kind === "state") {
        needStamp("at");
        if (!isObject(e.state) || !Object.keys(e.state).length) bad(`expect[${j}].state must be { "<path>": <value> } with at least one path`);
      } else if (kind === "output") {
        needStamp("at");
        if (typeof e.output !== "string") bad(`expect[${j}].output must name a value output`);
        if (!("value" in e)) bad(`expect[${j}] (output) needs a value`);
      } else if (kind === "events") {
        if (typeof e.events !== "string") bad(`expect[${j}].events must name an Event output`);
        if (("records" in e) === ("count" in e)) bad(`expect[${j}] (events) gives exactly one of records and count`);
        if ("records" in e && !(Array.isArray(e.records) && e.records.every(isObject))) bad(`expect[${j}].records must be an array of records, each an object`);
        if ("count" in e && !(Number.isInteger(e.count) && /** @type {number} */ (e.count) >= 0)) bad(`expect[${j}].count must be a whole number`);
        for (const k of ["from", "to"]) if (k in e) needStamp(k);
        const [from, to] = [stampOf(e.from), stampOf(e.to)];
        if (from !== null && to !== null && "from" in e && "to" in e && from > to) bad(`expect[${j}] (events) has from (${JSON.stringify(e.from)}) after to (${JSON.stringify(e.to)}): the window is empty`, "write from at or before to");
      } else {
        if (typeof e.diagnostic !== "string" || !/^[A-Z][0-9]{3}$/.test(e.diagnostic)) bad(`expect[${j}].diagnostic must be a code: a capital letter and three digits, not ${JSON.stringify(e.diagnostic)}`);
        if ("at" in e) needStamp("at");
      }
      if ("within" in e && !(typeof e.within === "number" && Number.isFinite(e.within) && e.within >= 0)) bad(`expect[${j}].within must be a number at least 0`);
    });
    if ("until" in t && stampOf(t.until) === null) bad(`"until" must be a stamp`);
    if ("seed" in t && !Number.isInteger(t.seed)) bad(`"seed" must be a whole number`);
  });
  return out;
}

/**
 * Why a state path does not name a value of the state type, or null. Fields join with ".", a list item is `[<i>]`, a
 * vector component is its name, and `<list>.length` is a list's size. A field the extensible struct lacks is the
 * Program's to declare, known only once an example is built, so it is not refused here.
 * @param {any} type  the Dialect's resolved state type @param {any} open  its extensible struct, or null @param {string} path
 * @returns {string | null}
 */
export function pathProblem(type, open, path) {
  return walkPath(type, open, path.replace(/\[(\d+)\]/g, ".[$1]").split("."));
}

/** @param {any} type @param {any} open @param {string[]} parts @returns {string | null} */
function walkPath(type, open, parts) {
  let t = type;
  let unknown = false;
  for (const [k, p] of parts.entries()) {
    if (unknown) return null;
    while (t && typeof t === "object" && "opt" in t) t = t.opt;
    if (t && typeof t === "object" && "union" in t) {
      // the rest of the path, from each member: the path is good when any member takes it
      const tried = t.union.map((/** @type {any} */ m) => walkPath(m, open, parts.slice(k)));
      return tried.some((/** @type {string | null} */ x) => x === null) ? null : tried[0];
    }
    if (t && typeof t === "object" && "list" in t) {
      if (p === "length") { t = "f64"; continue; }
      if (/^\[\d+\]$/.test(p)) { t = t.list; continue; }
      return `'${p}' after a list: a list takes [<i>] or .length`;
    }
    if (t && typeof t === "object" && "vec" in t) {
      const i = COMPONENTS.indexOf(p) % 4;
      if (/^\[\d+\]$/.test(p) || (i >= 0 && i < t.vec)) { t = "f64"; continue; }
      return `'${p}' is not a component of a vector of ${t.vec}`;
    }
    if (t && typeof t === "object" && "struct" in t) {
      if (Object.hasOwn(t.struct, p)) { t = t.struct[p]; continue; }
      if (open === t) { unknown = true; continue; }
      return `the state has no field '${p}' there (its fields: ${Object.keys(t.struct).join(", ")})`;
    }
    return `'${p}' goes inside a value that has no fields`;
  }
  return null;
}

/**
 * The names and records of a loaded package's tests against its Dialect, without a run: K020 (a test names an input,
 * output or state path the Dialect lacks, or of the wrong kind) and K021 (a record does not fit its input's seam). A
 * package that did not load, or has no tests, has nothing to check.
 * @param {{ name?: unknown, dialect: unknown, tests?: any[], diagnostics?: unknown[] }} loaded
 * @returns {PackageDiagnostic[]}
 */
export function checkTests(loaded) {
  const dialect = /** @type {any} */ (loaded.dialect);
  const tests = loaded.tests ?? [];
  if (!dialect || loaded.diagnostics?.length || !tests.length) return [];
  /** @type {PackageDiagnostic[]} */
  const out = [];
  /** @param {"K020" | "K021"} code @param {string} test @param {string} message @param {string} fix */
  const add = (code, test, message, fix) => out.push({ ...diag(code, `test ${test}: ${message}`, fix, MANIFEST_PATH), test });
  /** @type {Record<string, any>} */
  const ins = dialect.seams?.in ?? {}, outs = dialect.seams?.out ?? {};
  const names = (/** @type {Record<string, any>} */ ports, /** @type {(k: string) => boolean} */ pick) => Object.keys(ports).filter((k) => pick(ports[k].seam.kind)).join(", ") || "none";
  const isEvent = (/** @type {string} */ k) => k === "event";
  const isValue = (/** @type {string} */ k) => k !== "event" && k !== "draw";
  const open = dialect.state && dialect.stateType ? extensibleOf(dialect.state, dialect.stateType) : null;
  for (const t of tests) {
    t.inputs?.forEach((/** @type {any} */ x, /** @type {number} */ j) => {
      if (!Object.hasOwn(ins, x.in) || ins[x.in].seam.kind !== "event") {
        add("K020", t.name, `inputs[${j}].in is '${x.in}', which is not an Event input of the Dialect (its Event inputs: ${names(ins, isEvent)})`, `name an Event input; a test addresses <part>.in.<input> of the example's one part`);
        return;
      }
      const bad = valueProblem(ins[x.in].seam.of, x.value);
      if (bad) add("K021", t.name, `inputs[${j}].value does not fit the seam of '${x.in}': ${bad}`, `write the record as the input reads it in ctx.inputs.${x.in}: its own fields, in its own frame; a field with a default may be left out`);
    });
    t.expect?.forEach((/** @type {any} */ e, /** @type {number} */ j) => {
      if (typeof e.events === "string" && (!Object.hasOwn(outs, e.events) || outs[e.events].seam.kind !== "event")) add("K020", t.name, `expect[${j}].events is '${e.events}', which is not an Event output of the Dialect (its Event outputs: ${names(outs, isEvent)})`, `name an Event output`);
      if (typeof e.output === "string" && (!Object.hasOwn(outs, e.output) || !isValue(outs[e.output].seam.kind))) add("K020", t.name, `expect[${j}].output is '${e.output}', which is not a value output of the Dialect (its value outputs: ${names(outs, isValue)})`, `name a value output: an Event or a Draw output is not read by value`);
      if (isObject(e.state)) for (const path of Object.keys(e.state)) {
        const bad = dialect.stateType ? pathProblem(dialect.stateType, open, path) : `the Dialect declares no state`;
        if (bad) add("K020", t.name, `expect[${j}].state path '${path}': ${bad}`, `write a path into the Dialect's state: fields joined by ".", a list item as [<i>], a vector component by name`);
      }
    });
  }
  return out;
}

/** A record as the input will take it: its defaults filled (a record that already fits). @param {any} dialect @param {string} input @param {unknown} value */
export const recordFor = (dialect, input, value) => fillDefaults(dialect.seams.in[input].seam.of, value);

/** A state path's value, `null` where there is none. Paths are as `checkTests` reads them. @param {any} state @param {string} path */
export function readStatePath(state, path) {
  let v = state;
  for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) {
      const i = COMPONENTS.indexOf(part);
      if (part === "length") v = v.length;
      else if (/^\d+$/.test(part)) v = v[Number(part)];
      else if (i >= 0) v = v[i % 4];
      else return null;
    } else if (typeof v === "object") v = Object.hasOwn(v, part) ? v[part] : undefined;
    else return null;
  }
  return v === undefined ? null : v;
}

/** JSON-data equality, deep and exact (an object has exactly its fields), numbers within `within`. @param {unknown} a @param {unknown} b @param {number} within @returns {boolean} */
export function sameData(a, b, within) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= within;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameData(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k], within));
}
