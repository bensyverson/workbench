// The data Dialect, declared through the Definition API (kit/define): the `date` scalar, the row, group and
// calc Iteration Spaces, the date and number intrinsics, and the slot conventions that type a lambda's row or
// group from its table's columns at that step (the construct state grammar.js builds from the sources'
// schemas). Every lambda is pure: this Dialect has no effects and no stores.
// Started from dogfood trial 2's agent A (scripts/define-trial/runs/2026-11-24-trial-2/agent-a/data.dialect.js).

import { defineDialect, scalar, exact, object } from "../../define/index.js";

/** @import { ConventionFn, DefineSlotRef, TypeDef } from "../../define/define.js" */

/** The column types a schema may name. There is no integer type: a whole number is an f64. */
export const COLUMN_TYPES = Object.freeze(["f64", "str", "bool", "date"]);

/** A table's columns at one step: name to type, in definition terms (a column type, or what a derive inferred). */
/** @typedef {Record<string, TypeDef>} Columns */

/** @param {number} d */
const monthStart = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };
/** @param {number} d */
const monthIndex = (d) => { const x = new Date(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };

/** @param {unknown} state @returns {Columns} */
const columnsOf = (state) => /** @type {{ columns?: Columns } | undefined} */ (state)?.columns ?? {};

/**
 * A row convention: one parameter, the row, whose members are the table's columns at this step.
 * @param {TypeDef | "infer"} returns @param {string} space @returns {ConventionFn}
 */
const rowOf = (returns, space) => (ref, _program, state) => ({
  params: [object(`a row of ${ref.on}`, columnsOf(state))],
  returns,
  space,
});

/**
 * A group convention: one parameter, the group, with an aggregate per column, typed by the columns at this step.
 * @param {TypeDef | "infer"} returns @returns {ConventionFn}
 */
const groupOf = (returns) => (/** @type {DefineSlotRef} */ ref, _program, state) => {
  const columns = columnsOf(state);
  /** @typedef {Record<string, { params: TypeDef[], returns: TypeDef }>} Keys */
  /** @type {Keys} */ const numeric = {};
  /** @type {Keys} */ const sameType = {};
  /** @type {Keys} */ const counted = {};
  for (const [c, t] of Object.entries(columns)) {
    sameType[c] = { params: [], returns: t };
    counted[c] = { params: [], returns: "f64" };
    if (t === "f64") numeric[c] = { params: [], returns: "f64" };
  }
  const members = {
    count: { fn: { params: [], returns: "f64" } },
    sum: { keyed: { what: "numeric column", keys: numeric } },
    mean: { keyed: { what: "numeric column", keys: numeric } },
    min: { keyed: { what: "column", keys: sameType } },
    max: { keyed: { what: "column", keys: sameType } },
    countDistinct: { keyed: { what: "column", keys: counted } },
  };
  return { params: [object(`a group of ${ref.on}`, members)], returns, space: "group" };
};

/** The most rows and the widest cell the text view shows: enough to read a table, small enough for a model. */
const TEXT_ROWS = 20;
const TEXT_CELL = 24;

/**
 * A table as a host shows it: its name, its columns at its last step (name to type) and its rows.
 * @typedef {{ name: string, columns: Columns, rows: Array<Record<string, unknown>> }} Table
 */

/**
 * A column type in a few characters: a name as written, an inferred enum as its members.
 * @param {unknown} t
 */
function typeName(t) {
  if (typeof t === "string") return t;
  const values = /** @type {any} */ (t)?.values ?? /** @type {any} */ (t)?.enum;
  return Array.isArray(values) ? `enum(${values.join(", ")})` : "a computed type";
}

/**
 * The text view: a table's row count, its columns with their types, then its first rows, one per line with
 * cells split by " | " (a date as its UTC day, else as its number when Date cannot hold it; a long cell cut
 * with "…"). A table with no columns is its first line alone.
 * @param {Table} table
 * @returns {string}
 */
function tableText(table) {
  const names = Object.keys(table.columns);
  /** @param {string} c @param {unknown} v */
  const cell = (c, v) => {
    const s = v === null || v === undefined ? "null" : table.columns[c] === "date" && typeof v === "number" && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString().slice(0, 10) : String(v);
    return s.length > TEXT_CELL ? `${s.slice(0, TEXT_CELL - 1)}…` : s;
  };
  const n = table.rows.length;
  const lines = [`${table.name}: ${n} row${n === 1 ? "" : "s"}`];
  if (names.length) lines.push(names.map((c) => `${c}: ${typeName(table.columns[c])}`).join(" | "));
  for (const row of table.rows.slice(0, TEXT_ROWS)) lines.push(names.map((c) => cell(c, row[c])).join(" | "));
  if (n > TEXT_ROWS) lines.push(`… ${n - TEXT_ROWS} more row${n - TEXT_ROWS === 1 ? "" : "s"}`);
  return lines.join("\n");
}

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  /** A row (derive, filter), a group (agg), or nothing but the params (a chart's encodings, limit). */
  spaces: { row: { pure: true }, group: { pure: true }, calc: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    dateOf: {
      params: ["f64", "f64", "f64"], returns: "date",
      ref: (y, m, d) => Date.UTC(y, m - 1, d),
      spell: { js: { call: "wb_dateOf($0, $1, $2)", prelude: "const wb_dateOf = (y, m, d) => Date.UTC(y, m - 1, d);" } },
    },
    year: {
      params: ["date"], returns: "f64",
      ref: (d) => new Date(d).getUTCFullYear(),
      spell: { js: "new Date($0).getUTCFullYear()" },
    },
    month: {
      params: ["date"], returns: "f64",
      ref: (d) => new Date(d).getUTCMonth() + 1,
      spell: { js: "(new Date($0).getUTCMonth() + 1)" },
    },
    truncMonth: {
      params: ["date"], returns: "date",
      ref: monthStart,
      spell: { js: { call: "wb_truncMonth($0)", prelude: "const wb_truncMonth = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };" } },
    },
    monthDiff: {
      params: ["date", "date"], returns: "f64",
      ref: (a, b) => monthIndex(b) - monthIndex(a),
      spell: { js: { call: "wb_monthDiff($0, $1)", prelude: "const wb_monthDiff = (a, b) => { const i = (d) => { const x = new Date(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); }; return i(b) - i(a); };" } },
    },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
    abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } },
    round: { params: ["f64"], returns: "f64", ref: Math.round, spell: { js: "Math.round($0)" } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: rowOf("infer", "row"),
    pred: rowOf("bool", "row"),
    group: groupOf("infer"),
    calc: { params: [], returns: "infer", space: "calc" },
  },
  // Each param becomes a member of $: a number param an f64, a toggle a bool, a date param a date, any other a str.
  environment(program) {
    /** @type {Record<string, TypeDef>} */
    const members = {};
    for (const [n, p] of Object.entries(/** @type {Record<string, { value: unknown, kind?: string }>} */ (program.params ?? {}))) {
      members[n] = typeof p.value === "number" ? "f64"
        : typeof p.value === "boolean" ? "bool"
        : p.kind === "date" ? "date" : "str";
    }
    return { objects: { Params: { members } } };
  },
  // The text view's state is one table as a host shows it ({ name, columns, rows }).
  text: tableText,
});

/** The intrinsics as the interpreter and the JS backend read them: each with its signature, reference and `js` spelling. */
export const INTRINSICS = /** @type {Record<string, import("../fields/decls.js").Intrinsic>} */ (/** @type {unknown} */ (data.intrinsics));
