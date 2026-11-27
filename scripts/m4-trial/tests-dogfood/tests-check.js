// The draft tests entry's static checks, for the tests dogfood (leaf mxxKTa): what the draft gives checkManifest (the
// entry's shape, K002) and checkTests (names against the Dialect, K020; records against their input's seam, K021)
// (kit/package/README.md, "Tests (draft, 2026-11-27, leaf 74YzpH)"). Throwaway: the real checks are tests-build's.

import { loadForTests } from "./sim.js";

/** @param {string} code @param {string} test @param {string} message @returns {any} */
const diag = (code, test, message) => ({ code, severity: "error", test, message });

const TEST_KEYS = ["name", "example", "inputs", "expect", "until", "seed"];
const NAME = /^[a-z][a-z0-9-]*$/;
const KINDS = ["state", "events", "diagnostic"];
const EXPECT_KEYS = { state: ["at", "state", "within"], events: ["events", "from", "to", "records", "count", "within"], diagnostic: ["diagnostic", "at"] };

/** A stamp as a number, or null when it is not one: a number, or "<n>/<d>". @param {unknown} t */
function stamp(t) {
  if (typeof t === "number" && Number.isFinite(t) && t >= 0) return t;
  if (typeof t === "string" && /^\d+\/[1-9]\d*$/.test(t)) { const [n, d] = t.split("/").map(Number); return n / d; }
  return null;
}

/**
 * The entry's shape, as checkManifest would judge it (K002).
 * @param {unknown} tests @param {{ examples: string[], runtime: boolean }} manifest
 */
export function checkShape(tests, manifest) {
  /** @type {any[]} */
  const out = [];
  if (!Array.isArray(tests)) return [diag("K002", "", `tests is an array of tests, not ${JSON.stringify(tests)}`)];
  if (tests.length && !manifest.runtime) out.push(diag("K002", "", "a package with tests names a runtime in entry.runtime: only a runtime runs"));
  const seen = new Set();
  tests.forEach((t, i) => {
    const name = typeof t?.name === "string" ? t.name : `tests[${i}]`;
    const bad = (/** @type {string} */ m) => { out.push(diag("K002", name, `test ${name}: ${m}`)); };
    if (t === null || typeof t !== "object" || Array.isArray(t)) return bad("a test is an object");
    for (const k of Object.keys(t)) if (!TEST_KEYS.includes(k)) bad(`unknown key '${k}'; a test has ${TEST_KEYS.join(", ")}`);
    if (typeof t.name !== "string" || !NAME.test(t.name)) bad("name is required, matching ^[a-z][a-z0-9-]*$");
    else if (seen.has(t.name)) bad("two tests have this name"); else seen.add(t.name);
    if (typeof t.example !== "string" || !manifest.examples.includes(t.example)) bad(`example ${JSON.stringify(t.example)} is not one of the manifest's examples (${manifest.examples.join(", ")})`);
    if (!Array.isArray(t.inputs)) bad("inputs is required: an array, possibly empty");
    else {
      let last = -1;
      t.inputs.forEach((/** @type {any} */ x, /** @type {number} */ j) => {
        if (x === null || typeof x !== "object") return bad(`inputs[${j}] is { T, in, value }`);
        for (const k of Object.keys(x)) if (!["T", "in", "value"].includes(k)) bad(`inputs[${j}] has an unknown key '${k}'; an input is { T, in, value }`);
        const s = stamp(x.T);
        if (s === null) bad(`inputs[${j}].T is a number of seconds at least 0, or "<n>/<d>", not ${JSON.stringify(x.T)}`);
        else { if (s < last) bad(`inputs[${j}].T (${x.T}) comes before the input before it: a log is in order`); last = s; }
        if (typeof x.in !== "string") bad(`inputs[${j}].in names an Event input`);
        if (!("value" in x)) bad(`inputs[${j}] has no value`);
      });
    }
    if (!Array.isArray(t.expect) || t.expect.length === 0) bad("expect is required, with at least one expectation");
    else t.expect.forEach((/** @type {any} */ e, /** @type {number} */ j) => {
      if (e === null || typeof e !== "object") return bad(`expect[${j}] is an object`);
      const kinds = KINDS.filter((k) => k in e);
      if (kinds.length !== 1) return bad(`expect[${j}] has ${kinds.length ? `two kinds (${kinds.join(", ")})` : "no kind"}: give exactly one of state, events, diagnostic`);
      const kind = /** @type {"state" | "events" | "diagnostic"} */ (kinds[0]);
      for (const k of Object.keys(e)) if (!EXPECT_KEYS[kind].includes(k)) bad(`expect[${j}] (${kind}) has an unknown key '${k}'; it takes ${EXPECT_KEYS[kind].join(", ")}`);
      if (kind === "state") {
        if (stamp(e.at) === null) bad(`expect[${j}].at is required: a stamp`);
        if (e.state === null || typeof e.state !== "object" || Array.isArray(e.state) || !Object.keys(e.state).length) bad(`expect[${j}].state is { <path>: <value> } with at least one path`);
      } else if (kind === "events") {
        if (typeof e.events !== "string") bad(`expect[${j}].events names an Event output`);
        if (("records" in e) === ("count" in e)) bad(`expect[${j}] gives exactly one of records and count`);
        if ("records" in e && !Array.isArray(e.records)) bad(`expect[${j}].records is an array of records`);
        if ("count" in e && !(Number.isInteger(e.count) && e.count >= 0)) bad(`expect[${j}].count is a whole number`);
        for (const k of ["from", "to"]) if (k in e && stamp(e[k]) === null) bad(`expect[${j}].${k} is a stamp`);
      } else {
        if (typeof e.diagnostic !== "string" || !/^[A-Z]\d{3}$/.test(e.diagnostic)) bad(`expect[${j}].diagnostic is a code, a capital letter and three digits`);
        if ("at" in e && stamp(e.at) === null) bad(`expect[${j}].at is a stamp`);
      }
      if ("within" in e && !(typeof e.within === "number" && e.within >= 0)) bad(`expect[${j}].within is a number at least 0`);
    });
    if ("until" in t && stamp(t.until) === null) bad("until is a stamp");
    if ("seed" in t && !Number.isInteger(t.seed)) bad("seed is a whole number");
  });
  return out;
}

const COMPONENTS = ["x", "y", "z", "w", "r", "g", "b", "a"];

/**
 * Why a state path does not name a value of the state type, or null. @param {any} type @param {string} path
 * @returns {string | null}
 */
function pathProblem(type, path) {
  let t = type;
  const parts = path.replace(/\[(\d+)\]/g, ".[$1]").split(".");
  for (const p of parts) {
    while (t && typeof t === "object" && "opt" in t) t = t.opt;
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
      if (!Object.hasOwn(t.struct, p)) return `the state has no field '${p}' there (its fields: ${Object.keys(t.struct).join(", ")})`;
      t = t.struct[p];
      continue;
    }
    return `'${p}' goes inside a value that has no fields`;
  }
  return null;
}

/**
 * Why a record does not fit an Event input's parsed seam, or null (K021).
 * @param {any} seam  the parsed Event seam: { kind: "event", of } @param {unknown} value
 * @returns {string | null}
 */
function recordProblem(seam, value) {
  const of = seam.of;
  if (!of || of.kind !== "record") return null; // a non-record Event is not judged here
  if (value === null || typeof value !== "object" || Array.isArray(value)) return `the record is an object, not ${JSON.stringify(value)}`;
  const v = /** @type {Record<string, unknown>} */ (value);
  const problems = [];
  const defaults = of.defaults ?? {};
  for (const [f, ft] of Object.entries(/** @type {Record<string, any>} */ (of.fields))) {
    if (!Object.hasOwn(v, f)) { if (!Object.hasOwn(defaults, f)) problems.push(`'${f}' is missing and has no default`); continue; }
    const x = v[f];
    const want = ft.kind === "scalar" ? ft.of : ft.kind;
    const fits = ft.kind === "scalar" ? (ft.of === "bool" ? typeof x === "boolean" : ft.of === "str" ? typeof x === "string" : typeof x === "number" && Number.isFinite(x))
      : ft.kind === "point" || ft.kind === "vector" ? (ft.dims === 1 ? typeof x === "number" : Array.isArray(x) && x.length === ft.dims && x.every((c) => typeof c === "number"))
      : ft.kind === "quantity" ? typeof x === "number" : true;
    if (!fits) problems.push(`'${f}' is ${JSON.stringify(x)}, not a ${want}${ft.dims ? ` of ${ft.dims}` : ""}`);
  }
  for (const f of Object.keys(v)) if (!Object.hasOwn(of.fields, f)) problems.push(`'${f}' is not a field of the input (its fields: ${Object.keys(of.fields).join(", ") || "none"})`);
  return problems.length ? problems.join("; ") : null;
}

/**
 * Names and records against the loaded Dialect, as the draft's checkTests would (K020, K021).
 * @param {any[]} tests @param {any} dialect
 */
export function checkNames(tests, dialect) {
  /** @type {any[]} */
  const out = [];
  const ins = dialect.seams?.in ?? {}, outs = dialect.seams?.out ?? {};
  const eventIns = Object.keys(ins).filter((k) => ins[k].seam.kind === "event");
  const eventOuts = Object.keys(outs).filter((k) => outs[k].seam.kind === "event");
  for (const t of tests) {
    const name = t.name;
    for (const [j, x] of (t.inputs ?? []).entries()) {
      if (!eventIns.includes(x.in)) { out.push(diag("K020", name, `test ${name}: inputs[${j}].in is '${x.in}', not an Event input of the Dialect (its Event inputs: ${eventIns.join(", ") || "none"})`)); continue; }
      const why = recordProblem(ins[x.in].seam, x.value);
      if (why) out.push(diag("K021", name, `test ${name}: inputs[${j}].value does not fit ${x.in}'s seam: ${why}`));
    }
    for (const [j, e] of (t.expect ?? []).entries()) {
      if (typeof e?.events === "string" && !eventOuts.includes(e.events)) out.push(diag("K020", name, `test ${name}: expect[${j}].events is '${e.events}', not an Event output of the Dialect (its Event outputs: ${eventOuts.join(", ") || "none"})`));
      if (e?.state && typeof e.state === "object") for (const path of Object.keys(e.state)) {
        const why = pathProblem(dialect.stateType, path);
        if (why) out.push(diag("K020", name, `test ${name}: expect[${j}].state path '${path}': ${why}`));
      }
    }
  }
  return out;
}

/**
 * Every static check of a package folder's tests (the manifest's, or `given`): K002, then K020 and K021 when the
 * shape is clean and the package loads.
 * @param {string} dir @param {any[] | null} [given]
 */
export async function checkTests(dir, given = null) {
  const { pkg, files, tests: own } = await loadForTests(dir);
  const manifest = JSON.parse(String(files["wb-package.json"]));
  const tests = given ?? own;
  if (tests === null) return [];
  const shape = checkShape(tests, { examples: manifest.examples ?? [], runtime: !!manifest.entry?.runtime });
  if (!pkg) return shape;
  const valid = Array.isArray(tests) ? tests.filter((t) => t && typeof t === "object" && !shape.some((/** @type {any} */ d) => d.test === t.name && d.test !== "")) : [];
  return [...shape, ...checkNames(valid, pkg.loaded.dialect)];
}
