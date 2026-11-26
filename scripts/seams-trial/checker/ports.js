// The draft's Dialect additions, judged: `ports` (out and in), `frames`, `edges(record)` and `inputs`. `declare`
// reads them from a defineDialect declaration before the kit sees it (the input object's members are needed to
// build the Dialect); `against` judges the outputs against the Dialect's resolved run's state once the kit has
// built it. Every problem is a D024–D030 at a path inside the declaration, as kit/define's own are.

import { parseSeam, printSeam, framesOf, leavesOf, pairLocal, printType } from "./seam.js";
import { didYouMean } from "../../../kit/define/codes.js";
import { TAG, kindOf, enumOf, struct, list } from "../../../kit/define/tags.js";
import { resolvePath } from "../../../kit/define/ui/shapes.js";
import { checkLambda } from "../../../kit/define/ui/lambda.js";

/** @import { Seam } from "./seam.js" */
/** @import { Type } from "../../../kit/ir/ir.js" */

/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string, line?: number }} Problem */
/** @typedef {{ name: string, seam: Seam, seamText: string, from: string | Function, note: string | null }} OutPort */
/** @typedef {{ name: string, seam: Seam, seamText: string, note: string | null, default?: unknown, required: boolean, member: unknown }} InPort */
/** @typedef {{ name: string, dims: 1 | 2 | 3, note: string, extent: Function | null }} Frame */
/**
 * What a Dialect declares at its seams, parsed: the stand-in keeps it beside the kit's Dialect value.
 * @typedef {{ out: Record<string, OutPort>, in: Record<string, InPort>, frames: Record<string, Frame>, edges: Function | null, inputs: { object: string, name: string } | null }} Seams
 */

export const SEAM_KEYS = Object.freeze(["ports", "frames", "edges", "inputs"]);
const OUT_KEYS = ["seam", "from", "note"];
const IN_KEYS = ["seam", "note", "default", "required", "type"];
const FRAME_KEYS = ["dims", "note", "extent"];
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(TAG in v);
/** @param {unknown} v */
const show = (v) => { try { return typeof v === "function" ? "a function" : JSON.stringify(v) ?? String(v); } catch { return String(v); } };

/**
 * Reads the seams of a declaration.
 * @param {Record<string, any>} def  the whole defineDialect declaration
 * @returns {{ problems: Problem[], seams: Seams, members: Record<string, unknown> }}  `members`: the inputs object's, by input
 */
export function declare(def) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {string} */ code, /** @type {Array<string | number>} */ path, /** @type {string} */ message, /** @type {string} */ tip) => out.push({ code, path, message, tip });
  /** @type {Seams} */
  const seams = { out: {}, in: {}, frames: {}, edges: null, inputs: null };
  /** @type {Record<string, unknown>} */
  const members = {};
  /** @param {Record<string, any>} o @param {string[]} allowed @param {Array<string | number>} at @param {string} what @param {string} code */
  const keys = (o, allowed, at, what, code) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add(code, [...at, k], `${what} has no key '${k}'.${didYouMean(k, allowed)}`, `use ${allowed.map((a) => `'${a}'`).join(", ")}`);
  };

  // frames first: the seams name them
  if (def.frames !== undefined) {
    if (!isObj(def.frames)) add("D030", ["frames"], `frames is an object of frames by name, not ${show(def.frames)}`, 'frames: { cell: { dims: 2, note: "…" } }');
    else for (const [n, f] of Object.entries(def.frames)) {
      const at = ["frames", n];
      if (!IDENT.test(n)) { add("D030", at, `the frame name '${n}' is not an identifier`, "rename the frame"); continue; }
      if (!isObj(f)) { add("D030", at, `frame '${n}' is { dims, note, extent? }, not ${show(f)}`, `${n}: { dims: 2, note: "…" }`); continue; }
      keys(f, FRAME_KEYS, at, `frame '${n}'`, "D030");
      const dimsOk = f.dims === 1 || f.dims === 2 || f.dims === 3;
      if (!dimsOk) add("D030", [...at, "dims"], `frame '${n}': dims is 1 (a unit: seconds), 2 or 3 (a space), not ${show(f.dims)}`, "dims: 2");
      if (typeof f.note !== "string" || f.note.trim() === "") add("D030", [...at, "note"], `frame '${n}' has no note: a composer reads it to relate the frame to another package's (which way the axes point, where the origin is)`, 'note: "grid cells; x right, y down; (0, 0) is the top-left cell\'s center"');
      if (f.extent !== undefined && typeof f.extent !== "function") add("D030", [...at, "extent"], `frame '${n}': extent is a function of the built record, (record) => ({ min: [x0, y0], max: [x1, y1] }), not ${show(f.extent)}`, "extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] })");
      if (dimsOk) seams.frames[n] = { name: n, dims: f.dims, note: typeof f.note === "string" ? f.note : "", extent: typeof f.extent === "function" ? f.extent : null };
    }
  }
  if (def.edges !== undefined) {
    if (typeof def.edges !== "function") add("D030", ["edges"], `edges is a function of the built record, (record) => [{ from, to, scale, offset }], not ${show(def.edges)}`, 'edges(record) { return [{ from: "cell", to: "px", scale: 16, offset: 8 }]; }');
    else seams.edges = def.edges;
  }

  /** Parses a port's seam and checks its frames. @param {any} p @param {Array<string | number>} at @param {string} what @returns {Seam | null} */
  const seamOf = (p, at, what) => {
    if (p.seam === undefined) { add("D024", at, `${what} has no seam: its type, in the seam vocabulary`, 'seam: "point2@cell"'); return null; }
    const r = parseSeam(p.seam);
    if (!r.ok) { add("D025", [...at, "seam"], `${what}: the seam ${show(p.seam)} does not parse: ${r.error}`, 'write a seam type such as "f64", "point2@cell" or "Event<{ at: point2@cell }>"'); return null; }
    let ok = true;
    for (const f of framesOf(r.type)) {
      if (!Object.hasOwn(seams.frames, f)) {
        ok = false;
        const known = Object.keys(seams.frames);
        add("D025", [...at, "seam"], `${what}: the seam ${printSeam(r.type)} names the frame '${f}', which this Dialect does not declare.${didYouMean(f, known)}`, known.length ? `use one of: ${known.join(", ")}, or declare frames: { ${f}: { dims, note } }` : `declare it: frames: { ${f}: { dims: 2, note: "…" } }`);
      }
    }
    for (const { field, seam } of leavesOf(r.type)) {
      if ((seam.kind === "point" || seam.kind === "vector") && seam.frame !== null && seams.frames[seam.frame] && seams.frames[seam.frame].dims !== seam.dims) {
        ok = false;
        add("D025", [...at, "seam"], `${what}: ${field ? `the field '${field}' is` : "the seam is"} ${printSeam(seam)}, but the frame '${seam.frame}' has ${seams.frames[seam.frame].dims} dims`, `write ${seam.kind === "point" ? "point" : "vec"}${seams.frames[seam.frame].dims}@${seam.frame}, or tag it with a frame of ${seam.dims} dims`);
      }
    }
    return ok ? r.type : null;
  };
  /** @param {any} p @param {Seam} seam @param {Array<string | number>} at @param {string} what */
  const note = (p, seam, at, what) => {
    if (p.note !== undefined && typeof p.note !== "string") { add("D024", [...at, "note"], `${what}: note is a string, not ${show(p.note)}`, 'note: "…"'); return null; }
    if ((seam.kind === "event" || framesOf(seam).length > 0) && (typeof p.note !== "string" || p.note.trim() === "")) {
      add("D024", at, `${what} has no note; a tagged or Event port needs one: a composer reads it to decide what to wire (what the value is, in which frame, when it changes)`, 'note: "a coin picked up this step, at its cell"');
    }
    return typeof p.note === "string" ? p.note : null;
  };

  const ports = def.ports;
  if (ports !== undefined && !isObj(ports)) add("D024", ["ports"], `ports is { out?, in? }, not ${show(ports)}`, "ports: { out: { … }, in: { … } }");
  if (isObj(ports)) {
    keys(ports, ["out", "in"], ["ports"], "ports", "D024");
    for (const side of /** @type {const} */ (["out", "in"])) {
      const group = ports[side];
      if (group === undefined) continue;
      if (!isObj(group)) { add("D024", ["ports", side], `ports.${side} is an object of ports by name, not ${show(group)}`, `${side}: { name: { seam: "…" } }`); continue; }
      for (const [n, p] of Object.entries(group)) {
        const at = ["ports", side, n];
        const what = `${side === "out" ? "output" : "input"} '${n}'`;
        if (!IDENT.test(n)) { add("D024", at, `the port name '${n}' is not an identifier`, "rename the port"); continue; }
        if (!isObj(p)) { add("D024", at, `${what} is { seam, … }, not ${show(p)}`, `${n}: { seam: "f64"${side === "out" ? `, from: "${n}"` : ", default: 0"} }`); continue; }
        keys(p, side === "out" ? OUT_KEYS : IN_KEYS, at, what, "D024");
        const seam = seamOf(p, at, what);
        if (seam === null) continue;
        const nt = note(p, seam, at, what);
        if (side === "out") {
          if (p.from === undefined) { add("D024", at, `${what} has no from: a path into the run's state, or a value lambda (s) => …`, `from: "${n}"`); continue; }
          if (typeof p.from !== "string" && typeof p.from !== "function") { add("D026", [...at, "from"], `${what}: from is a path into the run's state ("player.at") or a value lambda (s) => …, not ${show(p.from)}`, `from: "${n}"`); continue; }
          seams.out[n] = { name: n, seam, seamText: printSeam(seam), from: p.from, note: nt };
        } else {
          const member = inputMember(def, p, seam, at, what, add);
          if (seam.kind === "event") {
            if (p.default !== undefined || p.required !== undefined) add("D028", at, `${what} is an Event input: it is delivered to the host each step, so it takes neither a default nor required`, "remove default and required");
          } else {
            if (p.required !== undefined && p.required !== true) add("D028", [...at, "required"], `${what}: required is true or left out, not ${show(p.required)}`, "required: true");
            const has = p.default !== undefined, req = p.required === true;
            if (has === req) add("D028", at, has ? `${what} has both a default and required: true; a required input has no default to read` : `${what} has neither a default nor required: true; an unwired value input reads its default`, has ? "remove one of them" : `default: ${sampleDefault(seam)}, or required: true`);
            else if (has) { const why = fits(seam, p.default); if (why) add("D028", [...at, "default"], `${what}: the default ${show(p.default)} does not fit ${printSeam(seam)}: ${why}`, `default: ${sampleDefault(seam)}`); }
            if (member !== undefined) members[n] = member;
          }
          seams.in[n] = { name: n, seam, seamText: printSeam(seam), note: nt, ...(p.default !== undefined ? { default: p.default } : {}), required: p.required === true, member };
        }
      }
    }
  }

  const values = Object.values(seams.in).filter((p) => p.seam.kind !== "event");
  if (def.inputs !== undefined) {
    const i = def.inputs;
    if (!isObj(i)) add("D029", ["inputs"], `inputs is { object, name }, not ${show(i)}`, 'inputs: { object: "In", name: "inp" }');
    else {
      keys(i, ["object", "name"], ["inputs"], "inputs", "D029");
      const objects = isObj(def.objects) ? def.objects : {};
      const globals = isObj(def.globals) ? def.globals : {};
      if (typeof i.object !== "string" || !Object.hasOwn(objects, i.object)) add("D029", ["inputs", "object"], `inputs.object ${show(i.object)} is not one of the Dialect's objects.${typeof i.object === "string" ? didYouMean(i.object, Object.keys(objects)) : ""}`, `declare it, empty: objects: { ${typeof i.object === "string" ? i.object : "In"}: { label: "the inputs (inp)", members: {} } }`);
      else if (isObj(objects[i.object]?.members) && Object.keys(objects[i.object].members).length) add("D029", ["objects", i.object, "members"], `the inputs object '${i.object}' declares members itself; the kit fills it from ports.in`, `members: {}`);
      if (typeof i.name !== "string" || !IDENT.test(i.name)) add("D029", ["inputs", "name"], `inputs.name is the global lambdas read the inputs through, an identifier, not ${show(i.name)}`, 'name: "inp"');
      else if (globals[i.name] !== i.object) add("D029", ["globals"], `there is no global '${i.name}' naming the object ${show(i.object)}; lambdas read value inputs through it`, `globals: { …, ${i.name}: ${show(i.object)} }`);
      if (typeof i.object === "string" && typeof i.name === "string") seams.inputs = { object: i.object, name: i.name };
    }
  } else if (values.length) {
    add("D029", ["ports", "in", values[0].name], `the value input '${values[0].name}' is read in lambdas through an inputs object, and the Dialect declares none`, 'inputs: { object: "In", name: "inp" }, with objects: { In: { label: "the inputs (inp)", members: {} } } and globals: { inp: "In" }');
  }
  return { problems: out, seams, members };
}

/**
 * The type of an input's member on the inputs object: the local type its seam pairs with. A point or a vector
 * needs one of the Dialect's vector types of its dims (`type` names it when there are several).
 * @param {Record<string, any>} def @param {any} p @param {Seam} seam @param {Array<string | number>} at @param {string} what
 * @param {(code: string, path: Array<string | number>, message: string, tip: string) => void} add
 * @returns {unknown}  undefined for an Event input, or when it has no local type
 */
function inputMember(def, p, seam, at, what, add) {
  if (seam.kind === "event") {
    if (p.type !== undefined) add("D024", [...at, "type"], `${what} is an Event input; it is not read in lambdas, so it has no type`, "remove type");
    return undefined;
  }
  const types = isObj(def.types) ? def.types : {};
  const vectors = (/** @type {number} */ dims) => Object.entries(types).filter(([, t]) => kindOf(t) === "vector" && /** @type {any} */ (t).n === dims && /** @type {any} */ (t).elem === "f64").map(([n]) => n);
  /** @param {Seam} s @param {string} where @returns {unknown} */
  const local = (s, where) => {
    switch (s.kind) {
      case "scalar": return s.of;
      case "quantity": return "f64";
      case "enum": return enumOf(s.values);
      case "record": {
        /** @type {Record<string, unknown>} */
        const fields = {};
        for (const [k, f] of Object.entries(s.fields)) { const t = local(f, `${where}.${k}`); if (t === undefined) return undefined; fields[k] = t; }
        return struct(fields);
      }
      case "list": { const t = local(s.of, `${where}[]`); return t === undefined ? undefined : list(t, s.max); }
      case "point": case "vector": {
        const found = vectors(s.dims);
        if (p.type !== undefined) {
          if (found.includes(p.type)) return p.type;
          add("D027", [...at, "type"], `${what}: type ${show(p.type)} is not one of the Dialect's vector(${s.dims}, "f64") types${found.length ? `: ${found.join(", ")}` : ""}`, found.length ? `type: "${found[0]}"` : `declare one: types: { vec${s.dims}: vector(${s.dims}, "f64") }`);
          return undefined;
        }
        if (found.length === 1) return found[0];
        add("D027", at, found.length ? `${what}${where ? ` (${where})` : ""} is ${printSeam(s)}, and the Dialect has ${found.length} vector(${s.dims}, "f64") types (${found.join(", ")}); say which it reads as` : `${what}${where ? ` (${where})` : ""} is ${printSeam(s)}, which pairs with a vector(${s.dims}, "f64") type, and the Dialect declares none`, found.length ? `type: "${found[0]}"` : `declare one: types: { vec${s.dims}: vector(${s.dims}, "f64") }`);
        return undefined;
      }
      default: return undefined;
    }
  };
  return local(seam, "");
}

/** A value that fits a seam type, for a fix. @param {Seam} s @returns {string} */
function sampleDefault(s) {
  switch (s.kind) {
    case "scalar": return s.of === "f64" ? "0" : s.of === "bool" ? "false" : '""';
    case "quantity": return "1";
    case "point": case "vector": return `[${Array(s.dims).fill(0).join(", ")}]`;
    case "enum": return `"${s.values[0]}"`;
    case "record": return `{ ${Object.entries(s.fields).map(([k, f]) => `${k}: ${sampleDefault(f)}`).join(", ")} }`;
    case "list": return "[]";
    default: return "…";
  }
}

/** Why `v` is not a value of seam type `s`, or null. @param {Seam} s @param {unknown} v @returns {string | null} */
export function fits(s, v) {
  const num = (/** @type {unknown} */ x) => typeof x === "number" && Number.isFinite(x);
  switch (s.kind) {
    case "scalar": return s.of === "f64" ? (num(v) ? null : "it is not a finite number") : typeof v === (s.of === "bool" ? "boolean" : "string") ? null : `it is not a ${s.of === "bool" ? "boolean" : "string"}`;
    case "quantity": return num(v) ? null : "it is not a finite number";
    case "point": case "vector": return Array.isArray(v) && v.length === s.dims && v.every(num) ? null : `it is not an array of ${s.dims} numbers`;
    case "enum": return typeof v === "string" && s.values.includes(v) ? null : `it is not one of ${s.values.map((x) => `'${x}'`).join(", ")}`;
    case "record": {
      if (!isObj(v)) return "it is not an object";
      for (const k of Object.keys(s.fields)) { if (!Object.hasOwn(v, k)) return `it has no '${k}'`; const w = fits(s.fields[k], v[k]); if (w) return `'${k}': ${w}`; }
      for (const k of Object.keys(v)) if (!Object.hasOwn(s.fields, k)) return `it has '${k}', which the record does not`;
      return null;
    }
    case "list": {
      if (!Array.isArray(v)) return "it is not an array";
      if (v.length > s.max) return `it has ${v.length} items, more than ${s.max}`;
      for (const x of v) { const w = fits(s.of, x); if (w) return `an item: ${w}`; }
      return null;
    }
    default: return "an Event has no value";
  }
}

/**
 * Judges the outputs against the Dialect's resolved state: a path must name something there, and the type there
 * must pair with the seam; an Event's from must be a path to a state list; a lambda must keep the UI value lambda
 * rules (its result's type is judged when a Program lowers, `lowerPorts`).
 * @param {Seams} seams @param {any} dialect  the kit's Dialect
 * @returns {Problem[]}
 */
export function against(seams, dialect) {
  /** @type {Problem[]} */
  const out = [];
  const def = /** @type {Record<string, any>} */ (dialect.def);
  const state = /** @type {Type | undefined} */ (dialect.stateType);
  const ctx = lambdaContext(def, state ?? null);
  for (const p of Object.values(seams.out)) {
    const at = ["ports", "out", p.name, "from"];
    const what = `output '${p.name}'`;
    if (!state) { out.push({ code: "D026", path: at, message: `${what} reads the run's state, and the Dialect declares none`, tip: 'declare it: state: { t: "f64", … }' }); continue; }
    if (typeof p.from === "function") {
      if (p.seam.kind === "event") { out.push({ code: "D026", path: at, message: `${what} is an Event output, so its from is a path to the state list the host refills each step, not a lambda`, tip: `from: "${p.name}", with state: { ${p.name}: list(struct({ … }), 8) }` }); continue; }
      for (const lp of checkLambda(p.from, ctx)) out.push({ code: "D026", path: at, message: `${what}'s lambda: ${lp.message}`, tip: lp.fix, line: lp.line });
      continue;
    }
    const r = resolvePath(state, /** @type {string} */ (p.from), ctx.aliases);
    if ("error" in r) { out.push({ code: "D026", path: at, message: `${what}: ${r.error}`, tip: r.fix.replace(/show '([^']*)' in a table.*/, "point from at the list itself") }); continue; }
    if (p.seam.kind === "event" && !(typeof r.type === "object" && "list" in r.type)) { out.push({ code: "D026", path: at, message: `${what} is an Event output, so its from names a state list the host refills each step; '${p.from}' is ${printType(r.type)}`, tip: `declare state: { ${p.name}: list(struct({ … }), 8) } and write from: "${p.name}"` }); continue; }
    const why = pairLocal(p.seam, r.type);
    if (why) out.push({ code: "D027", path: [...at.slice(0, -1), "seam"], message: `${what}: the state at '${p.from}' does not pair with its seam: ${why}`, tip: `change the seam to fit ${printType(r.type)}, or the state to fit ${p.seamText}` });
  }
  return out;
}

/** The UI value lambda context over a Dialect: `(s, $)`, the Dialect's free names and globals. @param {Record<string, any>} def @param {Type | null} state */
export function lambdaContext(def, state) {
  /** @type {Record<string, Record<string, string>>} */
  const aliases = {};
  const free = new Set([...Object.keys(def.globals ?? {}), ...Object.keys(def.intrinsics ?? {}), ...Object.keys(def.library ?? {})]);
  for (const [n, t] of Object.entries(def.types ?? {})) {
    if (kindOf(t) !== "vector") continue;
    free.add(n);
    const a = /** @type {any} */ (t).options?.aliases;
    if (a) aliases[n] = a;
  }
  const objects = def.objects ?? {};
  const globalObjects = Object.fromEntries(Object.entries(def.globals ?? {}).filter(([, o]) => typeof o === "string" && Object.hasOwn(objects, o)).map(([n, o]) => [n, objects[/** @type {string} */ (o)]]));
  return { params: ["s", "$"], shapes: [state, null], free, objects: globalObjects, aliases };
}
