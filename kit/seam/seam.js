// The seam types (the draft's "Seam types"): a small closed vocabulary for what crosses between parts. This file
// parses the written form, prints it back canonically, pairs a seam type with a Dialect's local (IR) type, and
// compares a producer's seam with a consumer's, field by field, listing the tagged leaves a conversion needs.
// A rate is a vector or quantity per second (`vec2@px/s`): the kit's one shared unit, `s`, is the same in every
// package, so a rate converts by its space's edge alone.

/** @import { Type } from "../ir/ir.js" */

/**
 * A parsed seam type.
 * @typedef {{ kind: "scalar", of: "f64" | "bool" | "str" }
 *   | { kind: "quantity", frame: string, rate?: true }
 *   | { kind: "point", dims: 1 | 2 | 3, frame: string }
 *   | { kind: "vector", dims: 2 | 3, frame: string | null, rate?: true }
 *   | { kind: "enum", values: string[] }
 *   | { kind: "record", fields: Record<string, Seam> }
 *   | { kind: "list", of: Seam, max: number }
 *   | { kind: "event", of: Seam }} Seam
 */

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The kit's one shared unit, which every package may name without declaring it: seconds. */
export const SECONDS = "s";

/** A seam type's text that does not parse. */
class SeamSyntax extends Error {}

/**
 * Parses a seam type's written form.
 * @param {unknown} text
 * @returns {{ ok: true, type: Seam } | { ok: false, error: string }}
 */
export function parseSeam(text) {
  if (typeof text !== "string") return { ok: false, error: `a seam type is a string, such as "point2@cell", not ${typeof text}` };
  const toks = tokenize(text);
  if (!toks.ok) return toks;
  let i = 0;
  const list = toks.tokens;
  const peek = () => list[i] ?? "";
  const next = () => list[i++] ?? "";
  /** @param {string} t */
  const expect = (t) => { const got = next(); if (got !== t) throw new SeamSyntax(`expected '${t}'${got ? ` but found '${got}'` : " at the end"}`); };
  /** @param {boolean} top @returns {Seam} */
  const type = (top) => {
    const t = peek();
    if (t === "Event") {
      next(); expect("<");
      const of = type(false);
      if (of.kind !== "record") throw new SeamSyntax(`Event<R> takes a record, such as Event<{ at: point2@cell }>, not ${printSeam(of)}`);
      expect(">");
      if (!top) throw new SeamSyntax("an Event is a whole port's type; it cannot sit inside a record or a list");
      return { kind: "event", of };
    }
    if (t.startsWith("'")) {
      /** @type {string[]} */
      const values = [];
      for (;;) {
        const s = next();
        if (!s.startsWith("'")) throw new SeamSyntax(`an enum is string literals joined by |, such as 'rock' | 'open'; '${s || "the end"}' is not one`);
        const v = s.slice(1, -1);
        if (values.includes(v)) throw new SeamSyntax(`the enum lists '${v}' twice`);
        values.push(v);
        if (peek() !== "|") break;
        next();
      }
      return { kind: "enum", values };
    }
    if (t === "{") {
      next();
      /** @type {Record<string, Seam>} */
      const fields = {};
      while (peek() !== "}") {
        const f = next();
        if (!IDENT.test(f)) throw new SeamSyntax(`a record field is a name, not '${f || "the end"}'`);
        if (f === "__proto__") throw new SeamSyntax("a record field cannot be named __proto__");
        if (Object.hasOwn(fields, f)) throw new SeamSyntax(`the record has the field '${f}' twice`);
        expect(":");
        fields[f] = type(false);
        if (peek() === ",") next();
        else if (peek() !== "}") throw new SeamSyntax(`expected ',' or '}' after the field '${f}'${peek() ? `, found '${peek()}'` : ""}`);
      }
      next();
      return { kind: "record", fields };
    }
    if (t === "list") {
      next(); expect("<");
      const of = type(false);
      if (peek() !== ",") throw new SeamSyntax("a list needs its max: list<T, max>");
      next();
      const n = next();
      if (!/^[1-9]\d*$/.test(n)) throw new SeamSyntax(`a list's max is a positive whole number, not '${n}'`);
      expect(">");
      return { kind: "list", of, max: Number(n) };
    }
    next();
    const tag = () => {
      if (peek() !== "@") return null;
      next();
      const f = next();
      if (!IDENT.test(f)) throw new SeamSyntax(`a frame after @ is a name, not '${f || "the end"}'`);
      if (f === "__proto__") throw new SeamSyntax("a frame cannot be named __proto__");
      return f;
    };
    /** A trailing `/s`: whether the leaf is a rate. @param {string | null} f  its frame */
    const per = (f) => {
      if (peek() !== "/") return false;
      next();
      const u = next();
      if (u !== SECONDS) throw new SeamSyntax(`a rate is written per second only, ${t}${f === null ? "" : `@${f}`}/s, not per '${u || "nothing"}'`);
      if (f === null) throw new SeamSyntax(`a rate is measured in a frame: write ${t}@<frame>/s`);
      return true;
    };
    if (t === "f64") {
      const f = tag();
      const rate = per(f);
      return f === null ? { kind: "scalar", of: "f64" } : rate ? { kind: "quantity", frame: f, rate: true } : { kind: "quantity", frame: f };
    }
    if (t === "bool" || t === "str") {
      if (peek() === "@") throw new SeamSyntax(`${t} cannot be tagged with a frame; only f64, points and vectors are measured in one`);
      if (peek() === "/") throw new SeamSyntax(`${t} cannot be a rate; only f64 and vectors change per second`);
      return { kind: "scalar", of: t };
    }
    const m = /^(point|vec)([123])$/.exec(t);
    if (m && !(m[1] === "vec" && m[2] === "1")) {
      const dims = /** @type {1 | 2 | 3} */ (Number(m[2]));
      const f = tag();
      if (m[1] === "point") {
        if (f === null) throw new SeamSyntax(`a point is a position in a frame: write ${t}@<frame>`);
        if (peek() === "/") throw new SeamSyntax(`a point is a place, so it has no rate; a velocity is a vector: vec${dims}@${f}/s`);
        return { kind: "point", dims, frame: f };
      }
      const vdims = /** @type {2 | 3} */ (dims);
      return per(f) ? { kind: "vector", dims: vdims, frame: f, rate: true } : { kind: "vector", dims: vdims, frame: f };
    }
    throw new SeamSyntax(`'${t || "the end"}' is not a seam type; use f64, bool, str, f64@frame, point1@frame, point2@frame, point3@frame, vec2, vec3 (optionally @frame), an enum ('a' | 'b'), a record ({ … }), list<T, max> or Event<{ … }>`);
  };
  try {
    const out = type(true);
    if (i < list.length) throw new SeamSyntax(`unexpected '${list[i]}' after ${printSeam(out)}`);
    return { ok: true, type: out };
  } catch (e) {
    if (e instanceof SeamSyntax) return { ok: false, error: e.message };
    throw e;
  }
}

/** @param {string} text @returns {{ ok: true, tokens: string[] } | { ok: false, error: string }} */
function tokenize(text) {
  /** @type {string[]} */
  const tokens = [];
  const re = /\s*(?:([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|-\d+)|('[^']*'|"[^"]*")|([<>{}:,|@/]))/y;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m) return { ok: false, error: `cannot read '${text.slice(at).trim()}'` };
    tokens.push(m[1] ?? (m[2] ? `'${m[2].slice(1, -1)}'` : m[3]));
    at = re.lastIndex;
  }
  if (!tokens.length) return { ok: false, error: "the seam type is empty" };
  return { ok: true, tokens };
}

/** The canonical text of a seam type. @param {Seam} s @returns {string} */
export function printSeam(s) {
  switch (s.kind) {
    case "scalar": return s.of;
    case "quantity": return `f64@${s.frame}${s.rate ? "/s" : ""}`;
    case "point": return `point${s.dims}@${s.frame}`;
    case "vector": return `vec${s.dims}${s.frame === null ? "" : `@${s.frame}`}${s.rate ? "/s" : ""}`;
    case "enum": return s.values.map((v) => `'${v}'`).join(" | ");
    case "record": { const f = Object.entries(s.fields); return f.length ? `{ ${f.map(([k, v]) => `${k}: ${printSeam(v)}`).join(", ")} }` : "{}"; }
    case "list": return `list<${printSeam(s.of)}, ${s.max}>`;
    case "event": return `Event<${printSeam(s.of)}>`;
  }
}

/** The frame a leaf is tagged with, or null. @param {Seam} s */
export const frameOf = (s) => (s.kind === "quantity" || s.kind === "point" || s.kind === "vector" ? s.frame : null);

/** Every frame a seam type names, in order, once each. @param {Seam} s @returns {string[]} */
export function framesOf(s) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {Seam} */ t) => {
    const f = frameOf(t);
    if (f !== null && !out.includes(f)) out.push(f);
    if (t.kind === "record") Object.values(t.fields).forEach(walk);
    if (t.kind === "list" || t.kind === "event") walk(t.of);
  };
  walk(s);
  return out;
}

/** Each tagged point or vector in a seam type with its dims, for the frame dims check. @param {Seam} s @param {string} [at] @returns {Array<{ field: string, seam: Seam }>} */
export function leavesOf(s, at = "") {
  if (s.kind === "record") return Object.entries(s.fields).flatMap(([k, v]) => leavesOf(v, at ? `${at}.${k}` : k));
  if (s.kind === "list") return leavesOf(s.of, at ? `${at}[]` : "[]");
  if (s.kind === "event") return leavesOf(s.of, at);
  return [{ field: at, seam: s }];
}

/** A Type as a message writes it. @param {Type} t @returns {string} */
export function printType(t) {
  if (typeof t === "string") return t;
  if ("vec" in t) return t.name ?? `vector(${t.vec}, "${t.of}")`;
  if ("scalar" in t) return t.scalar;
  if ("enum" in t) return `enumOf([${t.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
  if ("struct" in t) return `struct({ ${Object.entries(t.struct).map(([k, v]) => `${k}: ${printType(v)}`).join(", ")} })`;
  if ("list" in t) return `list(${printType(t.list)}${t.max === undefined ? "" : `, ${t.max}`})`;
  if ("opt" in t) return `opt(${printType(t.opt)})`;
  return JSON.stringify(t);
}

/** @param {Type} t */
const isF64 = (t) => t === "f64" || (typeof t === "object" && "scalar" in t && t.of === "f64");

/**
 * Whether a Dialect's local type has the seam type's structure (the reference's pairing table). An Event pairs with
 * a state list of its record, of any max (even none).
 * @param {Seam} seam @param {Type} local
 * @returns {string | null}  what does not fit, or null
 */
export function pairLocal(seam, local) {
  const want = (/** @type {string} */ w) => `${printSeam(seam)} pairs with ${w}, not ${printType(local)}`;
  switch (seam.kind) {
    case "scalar":
      if (seam.of === "f64") return isF64(local) ? null : want('"f64"');
      if (seam.of === "bool") return local === "bool" ? null : want('"bool"');
      return local === "str" || (typeof local === "object" && "enum" in local) ? null : want('"str"');
    case "quantity": return isF64(local) ? null : want('"f64"');
    case "point": case "vector":
      if (seam.kind === "point" && seam.dims === 1) return isF64(local) ? null : want('"f64"');
      return typeof local === "object" && "vec" in local && local.vec === seam.dims && local.of === "f64" ? null : want(`a vector(${seam.dims}, "f64") type`);
    case "enum": {
      if (!(typeof local === "object" && "enum" in local)) return want(`enumOf([${seam.values.map((v) => JSON.stringify(v)).join(", ")}])`);
      const same = local.enum.length === seam.values.length && local.enum.every((v) => seam.values.includes(v));
      return same ? null : want(`enumOf with the same strings, ${seam.values.map((v) => `'${v}'`).join(", ")}`);
    }
    case "record": {
      if (!(typeof local === "object" && "struct" in local)) return want(`a struct({ ${Object.keys(seam.fields).join(", ")} })`);
      for (const k of Object.keys(seam.fields)) if (!Object.hasOwn(local.struct, k)) return `${printSeam(seam)}: the struct has no field '${k}'`;
      for (const k of Object.keys(local.struct)) if (!Object.hasOwn(seam.fields, k)) return `${printSeam(seam)}: the struct has the field '${k}', which the seam type does not`;
      if (local.optional?.length) return `${printSeam(seam)}: the struct's field '${local.optional[0]}' is optional; a seam record's fields are all present`;
      for (const [k, f] of Object.entries(seam.fields)) { const p = pairLocal(f, local.struct[k]); if (p) return `field '${k}': ${p}`; }
      return null;
    }
    case "list": {
      if (!(typeof local === "object" && "list" in local)) return want(`a list(…, ${seam.max})`);
      if (local.max === undefined) return `${printSeam(seam)} pairs with a list of max ${seam.max} or less, not a list with no max`;
      if (local.max > seam.max) return `${printSeam(seam)} pairs with a list of max ${seam.max} or less, not ${printType(local)}`;
      const p = pairLocal(seam.of, local.list);
      return p ? `the list's items: ${p}` : null;
    }
    case "event": {
      if (!(typeof local === "object" && "list" in local)) return `${printSeam(seam)} pairs with a list of its record, not ${printType(local)}`;
      const p = pairLocal(seam.of, local.list);
      return p ? `the list's items: ${p}` : null;
    }
  }
}

/**
 * One mismatch between a producer's seam and a consumer's. A field the producer has and the consumer does not take
 * is no mismatch: it is dropped on the wire, and listed in `dropped`.
 * @typedef {{ code: "S201" | "S202" | "S203" | "S204" | "S252" | "S255", field: string, message: string }} SeamProblem
 */
/**
 * A tagged leaf both sides have: where it is (`at`, `items[].at`, "" for the whole value), what kind, and its frames.
 * @typedef {{ field: string, kind: "point" | "vector" | "quantity", dims: number | null, from: string, to: string, rate?: true }} TaggedLeaf
 */

/** @param {Seam} s */
const kindWord = (s) => (s.kind === "event" ? "an Event" : s.kind === "record" ? "a record" : s.kind === "list" ? "a list" : s.kind === "enum" ? "an enum" : s.kind === "point" ? "a point" : s.kind === "vector" ? (s.rate ? "a vector per second" : "a vector") : s.kind === "quantity" ? (s.rate ? "a quantity per second" : "a quantity") : `${s.of === "f64" ? "an" : "a"} ${s.of}`);

/**
 * Compares what a producer's port gives with what a consumer's port takes. Frames are compared by name only as
 * tags (whether both sides are tagged); joining them is the frame graph's job, from `tagged`.
 * @param {Seam} from @param {Seam} to
 * @returns {{ problems: SeamProblem[], tagged: TaggedLeaf[], dropped: string[] }}
 */
export function compareSeams(from, to) {
  /** @type {SeamProblem[]} */
  const problems = [];
  /** @type {TaggedLeaf[]} */
  const tagged = [];
  /** The producer's record fields the consumer does not take, by path: dropped on the wire. @type {string[]} */
  const dropped = [];
  /** @param {string} field */
  const where = (field) => (field ? `the field '${field}'` : "the value");
  /** @param {Seam} a @param {Seam} b @param {string} field @param {boolean} inRecord */
  const walk = (a, b, field, inRecord) => {
    const add = (/** @type {SeamProblem["code"]} */ code, /** @type {string} */ message) => problems.push({ code, field, message });
    const pv = (/** @type {Seam} */ s) => s.kind === "point" || s.kind === "vector";
    if (pv(a) && pv(b) && a.kind !== b.kind) {
      add("S255", `${where(field)} is ${kindWord(a)} (${printSeam(a)}) and the input takes ${kindWord(b)} (${printSeam(b)}); a place and a displacement do not convert into each other`);
      return;
    }
    const f64 = (/** @type {Seam} */ s) => s.kind === "scalar" && s.of === "f64";
    // a 1-D point is one number in a frame, so an untagged f64 on its other side has the same S252 problem as a quantity's
    const measured = (/** @type {Seam} */ s) => s.kind === "quantity" || (s.kind === "point" && s.dims === 1);
    if ((f64(a) && measured(b)) || (measured(a) && f64(b))) {
      add("S252", `${where(field)} is ${printSeam(a)} and the input takes ${printSeam(b)}: ${f64(a) ? "the output is untagged" : "the input is untagged"}, so no frame says how to convert it`);
      return;
    }
    const sameKind = a.kind === b.kind || (a.kind === "enum" && b.kind === "scalar" && b.of === "str") || (a.kind === "scalar" && a.of === "str" && b.kind === "enum");
    const dimsDiffer = pv(a) && pv(b) && /** @type {any} */ (a).dims !== /** @type {any} */ (b).dims;
    const scalarDiffers = a.kind === "scalar" && b.kind === "scalar" && a.of !== b.of;
    // a rate is its own kind: a velocity is not a displacement, and the kit does not multiply by a duration
    const rateDiffers = (a.kind === "vector" || a.kind === "quantity") && Boolean(/** @type {any} */ (a).rate) !== Boolean(/** @type {any} */ (b).rate);
    if (!sameKind || dimsDiffer || scalarDiffers || rateDiffers) {
      add(inRecord ? "S202" : "S201", `${where(field)} is ${kindWord(a)} (${printSeam(a)}) and the input takes ${kindWord(b)} (${printSeam(b)})`);
      return;
    }
    switch (a.kind) {
      case "event": walk(a.of, /** @type {any} */ (b).of, field, false); return;
      case "record": {
        const bf = /** @type {any} */ (b).fields;
        const sub = (/** @type {string} */ k) => (field ? `${field}.${k}` : k);
        for (const k of Object.keys(bf)) if (!Object.hasOwn(a.fields, k)) problems.push({ code: "S202", field: sub(k), message: `the record has no field '${k}', which the input takes (${k}: ${printSeam(bf[k])})` });
        // a field the input does not take is dropped on the wire: a stranger's record may say more than the consumer reads
        for (const k of Object.keys(a.fields)) if (!Object.hasOwn(bf, k)) dropped.push(sub(k));
        for (const k of Object.keys(a.fields)) if (Object.hasOwn(bf, k)) walk(a.fields[k], bf[k], sub(k), true);
        return;
      }
      case "list": {
        const lb = /** @type {{ of: Seam, max: number }} */ (/** @type {any} */ (b));
        if (a.max > lb.max) add("S204", `${where(field)} is a list of up to ${a.max} and the input takes at most ${lb.max}`);
        walk(a.of, lb.of, field ? `${field}[]` : "[]", inRecord);
        return;
      }
      case "enum": {
        if (b.kind === "scalar") return; // an enum's strings are strings
        const extra = a.values.filter((v) => !/** @type {any} */ (b).values.includes(v));
        if (extra.length) add("S203", `${where(field)} may be ${extra.map((v) => `'${v}'`).join(" or ")}, which the input does not accept (it takes ${printSeam(b)})`);
        return;
      }
      case "scalar":
        if (b.kind === "enum") add("S203", `${where(field)} is any string and the input accepts only ${printSeam(b)}`);
        return;
      case "point": case "vector": case "quantity": {
        const fa = frameOf(a), fb = frameOf(b);
        if ((fa === null) !== (fb === null)) {
          add("S252", `${where(field)} is ${printSeam(a)} and the input takes ${printSeam(b)}: ${fa === null ? "the output is untagged" : "the input is untagged"}, so no frame says how to convert it`);
          return;
        }
        if (fa !== null && fb !== null) tagged.push({ field, kind: a.kind, dims: a.kind === "quantity" ? null : /** @type {any} */ (a).dims, from: fa, to: fb, ...(/** @type {any} */ (a).rate ? { rate: /** @type {const} */ (true) } : {}) });
      }
    }
  };
  walk(from, to, "", false);
  return { problems, tagged, dropped };
}
