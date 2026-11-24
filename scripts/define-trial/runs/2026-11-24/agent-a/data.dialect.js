import { defineDialect, enumOf, exact } from "kit/define";

// The data-tools Dialect: tables of rows, transformed step by step, with params and charts.
// A table's columns change at every step, so the row type a lambda sees is computed per step
// from the record (see replay below), not declared statically.

const NUMERIC = "f64";

/** The columns of a source or table, by name. */
function schemaOf(program, name, seen) {
  const src = program.sources?.[name];
  if (src) return { ...src.columns };
  const t = (program.table ?? []).find((r) => r.name === name);
  if (!t || seen.has(name)) return {};
  return replay(program, t, seen).final;
}

function pick(cols, names) {
  const out = {};
  for (const n of names) if (n in cols) out[n] = cols[n];
  return out;
}

/**
 * Replays a table's steps over its input's columns. For each step it keeps the columns
 * a row lambda at that step sees (`cols`) and the columns a group lambda sees (`groupCols`).
 */
function replay(program, t, seen = new Set()) {
  seen = new Set(seen).add(t.name);
  let cols = schemaOf(program, t.table, seen);
  let grouped = null;
  const steps = [];
  for (const { slot, args } of t.calls ?? []) {
    if (grouped && slot !== "agg") grouped = null;
    steps.push({ cols, groupCols: grouped ? grouped.before : cols });
    switch (slot) {
      case "rename":
        cols = Object.fromEntries(Object.entries(cols).map(([k, v]) => [args[0][k] ?? k, v]));
        break;
      case "cast":
        cols = { ...cols, ...args[0] };
        break;
      case "derive":
        cols = { ...cols, [args[0]]: args[1] };
        break;
      case "select":
        cols = pick(cols, args);
        break;
      case "join": {
        const right = schemaOf(program, args[0], seen);
        for (const k of args[1].take ?? Object.keys(right)) if (k in right) cols = { ...cols, [k]: right[k] };
        break;
      }
      case "groupBy":
        grouped = { keys: args, before: cols, started: false };
        // groupBy itself keeps the columns; the first agg narrows them to the keys.
        break;
      case "agg":
        if (!grouped) break;
        if (!grouped.started) {
          cols = pick(grouped.before, grouped.keys);
          grouped.started = true;
        }
        cols = { ...cols, [args[0]]: args[1] };
        // stay grouped so the next agg adds to the same result
        steps[steps.length - 1].groupCols = grouped.before;
        break;
      case "describe":
        cols = { column: "str", count: NUMERIC, nulls: NUMERIC, min: NUMERIC, max: NUMERIC, mean: NUMERIC };
        break;
      case "pivot": {
        const p = args[0];
        cols = { ...pick(cols, [p.rows]), ...Object.fromEntries(p.expect.map((c) => [c, NUMERIC])) };
        break;
      }
      case "zscore":
        cols = { ...cols, [`${args[0]}_z`]: NUMERIC };
        break;
      default:
        break; // filter, trim, replace, dropNulls, dedupe, sort, limit, keepGroups, semiJoin, winsorize, column
    }
  }
  return { steps, final: cols };
}

function rowObject(cols, label) {
  return { label, members: { ...cols } };
}

function groupObject(cols, label) {
  const numeric = Object.fromEntries(
    Object.entries(cols).filter(([, t]) => t === NUMERIC).map(([k]) => [k, { params: [], returns: NUMERIC }]),
  );
  const typed = Object.fromEntries(Object.entries(cols).map(([k, t]) => [k, { params: [], returns: t }]));
  const counted = Object.fromEntries(Object.keys(cols).map((k) => [k, { params: [], returns: NUMERIC }]));
  return {
    label,
    members: {
      sum: { keyed: { what: "column", keys: numeric } },
      mean: { keyed: { what: "column", keys: numeric } },
      min: { keyed: { what: "column", keys: typed } },
      max: { keyed: { what: "column", keys: typed } },
      countDistinct: { keyed: { what: "column", keys: counted } },
      count: { fn: { params: [], returns: NUMERIC } },
    },
  };
}

const rowName = (table, i) => `Row_${table}_${i}`;
const groupName = (table, i) => `Group_${table}_${i}`;

/** The index in `on.calls` of the call a lambda sits in, or -1. */
function stepIndex(ref) {
  const calls = ref.on?.calls ?? [];
  if (typeof ref.key === "string") return calls.findIndex((c) => c.slot === ref.kind && c.args[0] === ref.key);
  let n = -1;
  return calls.findIndex((c) => c.slot === ref.kind && ++n === ref.key);
}

/** A slot convention for a lambda over one row of the table it sits in. */
function overRow(returns) {
  return (ref) => {
    const i = stepIndex(ref);
    if (i < 0) return `a ${ref.kind} lambda must sit in a table`;
    const call = ref.on.calls[i];
    return { params: [rowName(ref.on.name, i)], returns: returns(call), space: "row" };
  };
}

/** A slot convention for a lambda over one group of rows of the table it sits in. */
function overGroup(returns) {
  return (ref) => {
    const i = stepIndex(ref);
    if (i < 0) return `a ${ref.kind} lambda must sit in a table`;
    const call = ref.on.calls[i];
    return { params: [groupName(ref.on.name, i)], returns: returns(call), space: "group" };
  };
}

function paramType(p) {
  if (typeof p.value === "boolean") return "bool";
  if (typeof p.value === "number") {
    const size = typeof p.max === "number";
    return size ? { value: NUMERIC, size: true } : NUMERIC;
  }
  if (Array.isArray(p.options)) return enumOf(p.options);
  return "str"; // a free string, a date string, or a select over a column's distinct values
}

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  spaces: {
    row: { pure: true },   // once per row of a table step
    group: { pure: true }, // once per group, after groupBy
    run: { pure: true },   // once per run: chart titles and formats that follow params
  },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    truncMonth: {
      params: ["str"], returns: "str",
      ref: (d) => `${d.slice(0, 7)}-01`,
      spell: { js: "($0.slice(0, 7) + \"-01\")" },
    },
    year: {
      params: ["str"], returns: "f64",
      ref: (d) => Number(d.slice(0, 4)),
      spell: { js: "Number($0.slice(0, 4))" },
    },
    concat: {
      params: ["str", "str"], returns: "str",
      ref: (a, b) => a + b,
      spell: { js: "($0 + $1)" },
    },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    derive: overRow((call) => call.args[1]),
    filter: overRow(() => "bool"),
    agg: overGroup((call) => call.args[1]),
    keepGroups: overGroup(() => "bool"),
    pivot: overGroup(() => NUMERIC),
    text: { params: [], returns: "str", space: "run" },
  },
  environment(program) {
    const objects = {};
    for (const t of program.table ?? []) {
      const { steps } = replay(program, t);
      steps.forEach((s, i) => {
        objects[rowName(t.name, i)] = rowObject(s.cols, `a row of table "${t.name}" at step ${i + 1}`);
        objects[groupName(t.name, i)] = groupObject(s.groupCols, `a group of table "${t.name}" at step ${i + 1}`);
      });
    }
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) members[n] = paramType(p);
    objects.Params = { members };
    return { objects };
  },
});

export { schemaOf };
