import { defineDialect, exact, enumOf } from "kit/define";

// Column types an author may name. There is no date or integer type in the kit,
// so a "date" column is carried as f64 days since 1970-01-01 (UTC) and a whole
// number is an f64.
export const COLUMN_TYPES = ["string", "number", "bool", "date"];
const KIT_TYPE = { string: "str", number: "f64", bool: "bool", date: "f64" };

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Schema walk: plain JavaScript over the record, shared by environment(),
// the slot conventions and the grammar's checks.
//
// Assumed record shape (the draft does not pin it down; see REPORT.md):
//   { name, sources: { sales: { csv, columns } }, params: { … },
//     table: [ { name, from, calls: [ { slot, args } ] } ], chart: [ … ], units }
// The two opening arguments of a table, name("table") and ref("table"), are
// assumed to land as `name` and `from`.
// ---------------------------------------------------------------------------

/** The table's opening arguments, under whichever keys the builder used. */
export function opened(rec) {
  const name = rec.name ?? (Array.isArray(rec.table) ? rec.table[0] : undefined);
  const from = rec.from ?? (Array.isArray(rec.table) ? rec.table[1] : rec.table);
  return { name, from };
}

/**
 * Every table's columns before each of its steps and after the last.
 * Returns { [tableName]: { before: [cols…], after: cols, groupedOver: [cols|null…] } }
 * where cols is { column: authorType }.
 */
export function schemas(program) {
  const out = {};
  for (const [n, s] of Object.entries(program.sources ?? {})) {
    out[n] = { before: [], after: { ...s.columns }, groupedOver: [] };
  }
  for (const rec of program.table ?? []) {
    const { name, from } = opened(rec);
    let cols = { ...(out[from]?.after ?? {}) };
    let grouped = null;      // the columns a run of agg/keepGroups calls aggregates over
    let keys = null;
    let aggCols = null;
    const before = [];
    const groupedOver = [];
    for (const call of rec.calls ?? []) {
      before.push({ ...cols });
      // keepGroups groups the rows as they stand; agg groups what groupBy saw.
      groupedOver.push(call.slot === "keepGroups" ? { ...cols } : call.slot === "agg" && grouped ? { ...grouped } : null);
      const a = call.args;
      switch (call.slot) {
        case "rename": {
          const next = {};
          for (const [c, t] of Object.entries(cols)) next[a[0][c] ?? c] = t;
          cols = next;
          break;
        }
        case "cast":
          cols = { ...cols, ...a[0] };
          break;
        case "derive":
          cols = { ...cols, [a[0]]: a[1] };
          break;
        case "groupBy":
          grouped = { ...cols };
          keys = a;
          aggCols = {};
          for (const k of keys) aggCols[k] = cols[k];
          cols = { ...aggCols };
          break;
        case "agg":
          if (aggCols) { aggCols[a[0]] = a[1]; cols = { ...aggCols }; }
          break;
        case "select": {
          const next = {};
          for (const c of a) if (c in cols) next[c] = cols[c];
          cols = next;
          break;
        }
        case "join": {
          const right = out[a[0]]?.after ?? {};
          const on = typeof a[1].on === "string" ? { [a[1].on]: a[1].on } : a[1].on;
          const rightKeys = new Set(Object.values(on));
          const take = a[1].take ?? Object.keys(right).filter((c) => !rightKeys.has(c));
          for (const c of take) cols[c] = right[c];
          break;
        }
        default:
          break;   // filter, semiJoin, sort, limit, trim, replace, dropNulls, dedupe keep columns
      }
      if (call.slot !== "groupBy" && call.slot !== "agg") {
        grouped = null; keys = null; aggCols = null;
      }
    }
    out[name] = { before, after: cols, groupedOver };
  }
  return out;
}

const rowObject = (table, i) => `Row_${table}_${i}`;
const groupObject = (table, i) => `Group_${table}_${i}`;

function rowMembers(cols) {
  const m = {};
  for (const [c, t] of Object.entries(cols)) m[c] = KIT_TYPE[t];
  return m;
}

function groupMembers(cols) {
  const numeric = {};
  const any = {};
  const typed = {};
  for (const [c, t] of Object.entries(cols)) {
    any[c] = { params: [], returns: "f64" };
    typed[c] = { params: [], returns: KIT_TYPE[t] };
    if (t === "number") numeric[c] = { params: [], returns: "f64" };
  }
  const quant = {};
  for (const c of Object.keys(numeric)) quant[c] = { params: ["f64"], returns: "f64" };
  return {
    count: { fn: { params: [], returns: "f64" } },
    sum: { keyed: { what: "numeric column", keys: numeric } },
    mean: { keyed: { what: "numeric column", keys: numeric } },
    sd: { keyed: { what: "numeric column", keys: numeric } },
    quantile: { keyed: { what: "numeric column", keys: quant } },
    min: { keyed: { what: "column", keys: typed } },
    max: { keyed: { what: "column", keys: typed } },
    countDistinct: { keyed: { what: "column", keys: any } },
  };
}

/**
 * Finds the call a lambda sits on. The draft gives ref = { id, kind, on, key },
 * with key "its leading name argument or index"; it does not say index of what.
 * Assumed: the index counts this slot's calls on this table.
 */
function stepOf(ref) {
  const calls = ref.on.calls ?? [];
  let seen = -1;
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].slot !== ref.kind) continue;
    seen++;
    if (typeof ref.key === "number" ? seen === ref.key : calls[i].args[0] === ref.key) return { call: calls[i], index: i };
  }
  return null;
}

const rowSlot = (returns) => (ref, program) => {
  const s = stepOf(ref);
  if (!s) return `no step found for this ${ref.kind} lambda`;
  const table = opened(ref.on).name;
  return { params: [rowObject(table, s.index)], returns: returns(s.call), space: "row" };
};

const groupSlot = (returns) => (ref, program) => {
  const s = stepOf(ref);
  if (!s) return `no step found for this ${ref.kind} lambda`;
  const table = opened(ref.on).name;
  if (!schemas(program)[table]?.groupedOver[s.index]) return `${ref.kind} must follow groupBy(…) (or another ${ref.kind})`;
  return { params: [groupObject(table, s.index)], returns: returns(s.call), space: "group" };
};

function paramType(p) {
  if (p.slider) return { value: "f64", size: true };
  if (p.select) return enumOf(p.select.options);
  if (p.selectNumber) return "f64";
  if (p.selectFrom) return "str";
  if (p.date) return "f64";
  if (p.toggle) return "bool";
  return "f64";
}

const days = (d) => new Date(d * DAY_MS);

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  spaces: {
    row: { pure: true },      // once per row: derive, filter
    group: { pure: true },    // once per group: agg, keepGroups
    scalar: { pure: true },   // once per run: limit
  },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } },
    sqrt: { params: ["f64"], returns: "f64", ref: Math.sqrt, spell: { js: "Math.sqrt($0)" } },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
    year: {
      params: ["f64"], returns: "f64",
      ref: (d) => days(d).getUTCFullYear(),
      spell: { js: { call: "year($0)", prelude: `const year = (d) => new Date(d * ${DAY_MS}).getUTCFullYear();` } },
    },
    month: {
      params: ["f64"], returns: "f64",
      ref: (d) => days(d).getUTCMonth() + 1,
      spell: { js: { call: "month($0)", prelude: `const month = (d) => new Date(d * ${DAY_MS}).getUTCMonth() + 1;` } },
    },
    truncMonth: {
      params: ["f64"], returns: "f64",
      ref: (d) => { const x = days(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) / DAY_MS; },
      spell: { js: { call: "truncMonth($0)", prelude: `const truncMonth = (d) => { const x = new Date(d * ${DAY_MS}); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) / ${DAY_MS}; };` } },
    },
    monthsBetween: {
      params: ["f64", "f64"], returns: "f64",
      ref: (a, b) => { const x = days(a), y = days(b); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); },
      spell: { js: { call: "monthsBetween($0, $1)", prelude: `const monthsBetween = (a, b) => { const x = new Date(a * ${DAY_MS}), y = new Date(b * ${DAY_MS}); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); };` } },
    },
  },
  library: {
    clamp: { fn: "(x, lo, hi) => min(max(x, lo), hi)" },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    derive: rowSlot((call) => KIT_TYPE[call.args[1]]),
    filter: rowSlot(() => "bool"),
    agg: groupSlot((call) => KIT_TYPE[call.args[1]]),
    keepGroups: groupSlot(() => "bool"),
    limit: { params: [], returns: "f64", space: "scalar" },
  },

  // Each param becomes a member of $; each table step gets a row object (and,
  // inside a grouping, a group object) with the columns at that point.
  environment(program) {
    const params = {};
    for (const [n, p] of Object.entries(program.params ?? {})) params[n] = paramType(p);
    const objects = { Params: { members: params } };
    const all = schemas(program);
    for (const [table, s] of Object.entries(all)) {
      s.before.forEach((cols, i) => {
        objects[rowObject(table, i)] = { label: `a row of ${table} (row)`, members: rowMembers(cols) };
        const g = s.groupedOver[i];
        if (g) objects[groupObject(table, i)] = { label: `a group of ${table} (g)`, members: groupMembers(g) };
      });
    }
    return { objects };
  },
});
