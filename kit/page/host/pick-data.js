// A `pick` Control's choices, from the Dialect's declared data file (project/2026-11-27-controls-draft.md, "Control
// kinds"): the table behind the form, and the record one row makes. Pure: the host hands over the file's text.

/**
 * RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. Blank lines are skipped.
 * @param {string} text @returns {string[][]}
 */
export function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "", quoted = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); if (row.length > 1 || row[0] !== "") rows.push(row); row = []; };
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/**
 * The rows a pick shows, from its data file: `{ columns, rows }` (every row an object by column; a CSV cell stays text, so a key like "007" is kept, and `pickRecord` converts a carried f64 column), or an `error` when
 * the file is not a table, or names no `key` column. A JSON file is a list of objects.
 * @param {{ kind: string, text?: string, value?: unknown } | null} file  the package's decoded data file
 * @param {{ key: string }} form
 * @returns {{ columns: string[], rows: Array<Record<string, any>>, error?: undefined } | { error: string }}
 */
export function pickTable(file, form) {
  if (!file) return { error: "the data file is not available to the page" };
  /** @type {Array<Record<string, any>>} */
  let rows;
  if (file.kind === "csv") {
    const [head = [], ...body] = parseCsv(file.text ?? "");
    rows = body.map((r) => Object.fromEntries(head.map((c, i) => [c, r[i] ?? ""])));
    if (!head.includes(form.key)) return { error: `the file has no column '${form.key}' (its columns are ${head.join(", ") || "none"})` };
  } else if (file.kind === "json" && Array.isArray(file.value) && file.value.every((r) => r && typeof r === "object")) rows = /** @type {any[]} */ (file.value);
  else return { error: `the data file is ${file.kind}, not a csv table or a json list of rows` };
  return { columns: [...new Set(rows.flatMap((r) => Object.keys(r)))], rows };
}

/**
 * The record one row makes: `{ value: <key>, <carried column>: … }`, each carried column as its declared type.
 * @param {Record<string, string | number>} row @param {{ key: string, carry?: Record<string, "f64" | "str"> }} form
 */
export function pickRecord(row, form) {
  /** @type {Record<string, unknown>} */
  const rec = { value: String(row[form.key]) };
  for (const [c, t] of Object.entries(form.carry ?? {})) rec[c] = t === "f64" ? Number(row[c]) : String(row[c] ?? "");
  return rec;
}

/**
 * A resolver from a form to its data file: the package whose Dialect declares `files.<form.file>`, preferring the
 * part a scoped form names. `loaded` is the host's Loaded (`packages[].loaded` has `dialect` and `data`; `composed.parts`
 * names each part's Dialect).
 * @param {{ composed: any, packages: Array<{ name: string, loaded: any }> }} loaded
 * @returns {(form: { file: string, part?: string }) => { kind: string, text?: string, value?: unknown } | null}
 */
export function dataFileOf(loaded) {
  return (form) => {
    const dialect = form.part ? loaded.composed?.parts?.find((/** @type {any} */ p) => p.name === form.part)?.dialect : undefined;
    const pools = [...loaded.packages.filter((p) => p.name === dialect), ...loaded.packages];
    for (const p of pools) {
      const decl = p.loaded?.dialect?.def?.files?.[form.file];
      if (decl) return p.loaded.data?.[decl.path] ?? null;
    }
    return null;
  };
}
