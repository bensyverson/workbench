// A Dialect's seams (the seams draft, as ruled 2026-11-26): `ports` (out and in), `frames`, `edges(record)` and
// `inputs`. `declareSeams` reads and judges them from a defineDialect declaration (D024–D030, D032), and gives
// what the Environment needs: the inputs object's members and each Event input's record object. `checkOutputs`
// judges the value outputs against the Dialect's resolved run's state once it is built (D026, D027).

import { parseSeam, printSeam, printValue, framesOf, leavesOf, pairLocal, printType, SECONDS } from "../seam/index.js";
import { didYouMean } from "./codes.js";
import { TAG, kindOf, enumOf, struct, list } from "./tags.js";
import { resolvePath } from "./ui/shapes.js";
import { checkLambda } from "./ui/lambda.js";

/** @import { Seam } from "../seam/seam.js" */
/** @import { Type } from "../ir/ir.js" */
/** @import { Problem } from "./types.js" */
/** @import { InPort, Frame, Seams, EventRecord } from "./define.js" */

export const SEAM_KEYS = Object.freeze(["ports", "frames", "edges", "inputs"]);
const OUT_KEYS = ["seam", "from", "note"];
const IN_KEYS = ["seam", "note", "default", "required", "type", "delivery", "record"];
const FRAME_KEYS = ["dims", "note", "extent"];
const RECORD_KEYS = ["name", "slots"];
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** The frames the kit declares for every package: one shared unit, seconds. */
export const KIT_FRAMES = /** @type {Readonly<Record<string, Frame>>} */ (Object.freeze({ [SECONDS]: Object.freeze({ name: SECONDS, dims: 1, note: "seconds: the kit's one unit, the same in every package", extent: null }) }));
/** Names a port or a frame may not take: `then` is probed on every object (a handle named so could not be read), `__proto__` is no plain key. */
const UNNAMEABLE = ["then", "__proto__"];
/** @param {string} n */
const unnameableWhy = (n) => (n === "then" ? "is probed on every object by runtimes and test libraries, so a handle of that name could not be read; rename it" : "is not a usable object key; rename it");
/** The delivery an Event input has when it declares none. */
export const RELIABLE = "reliable";

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(TAG in v);
/** @param {unknown} v */
const show = (v) => { try { return typeof v === "function" ? "a function" : JSON.stringify(v) ?? String(v); } catch { return String(v); } };

/** No seams: what a Dialect without ports or frames has. @returns {Seams} */
export const noSeams = () => ({ out: {}, in: {}, frames: {}, edges: null, inputs: null });

/**
 * Reads and judges the seams of a declaration.
 * @param {Record<string, any>} def  the whole defineDialect declaration
 * @returns {{ problems: Problem[], seams: Seams, members: Record<string, unknown>, records: EventRecord[] }}
 *   `members`: the inputs object's, by input; `records`: each Event input's record object, as lambdas read it
 */
export function declareSeams(def) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {string} */ code, /** @type {Array<string | number>} */ path, /** @type {string} */ message, /** @type {string} */ tip) => out.push({ code, path, message, tip });
  const seams = noSeams();
  /** @type {Record<string, unknown>} */
  const members = {};
  /** @type {EventRecord[]} */
  const records = [];
  /** Every frame name declared, its dims valid or not: a seam that names a frame refused for its dims is not also D025. @type {Set<string>} */
  const declaredFrames = new Set();
  /** @param {Record<string, any>} o @param {string[]} allowed @param {Array<string | number>} at @param {string} what @param {string} code */
  const keys = (o, allowed, at, what, code) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add(code, [...at, k], `${what} has no key '${k}'.${didYouMean(k, allowed)}`, `use ${allowed.map((a) => `'${a}'`).join(", ")}`);
  };
  /** A frame a seam may name: the Dialect's own, or the kit's. @param {string} f */
  const frameNamed = (f) => (Object.hasOwn(seams.frames, f) ? seams.frames[f] : Object.hasOwn(KIT_FRAMES, f) ? KIT_FRAMES[f] : undefined);

  // frames first: the seams name them
  if (def.frames !== undefined) {
    if (!isObj(def.frames)) add("D030", ["frames"], `frames is an object of frames by name, not ${show(def.frames)}`, 'frames: { cell: { dims: 2, note: "…" } }');
    else for (const [n, f] of Object.entries(def.frames)) {
      const at = ["frames", n];
      if (!IDENT.test(n)) { add("D030", at, `the frame name '${n}' is not an identifier`, "rename the frame"); continue; }
      if (UNNAMEABLE.includes(n)) { add("D030", at, `the frame name '${n}' ${unnameableWhy(n)}`, "rename the frame"); continue; }
      if (Object.hasOwn(KIT_FRAMES, n)) { add("D030", at, `the kit declares the frame '${n}' (${KIT_FRAMES[n].note}) for every package; a package names it without declaring it`, `remove frames.${n}; write f64@${n}, or a rate such as vec2@px/${n}`); declaredFrames.add(n); continue; }
      if (!isObj(f)) { add("D030", at, `frame '${n}' is { dims, note, extent? }, not ${show(f)}`, `${n}: { dims: 2, note: "…" }`); continue; }
      declaredFrames.add(n);
      if (Object.hasOwn(f, "edges")) add("D030", [...at, "edges"], `frame '${n}' has no key 'edges': edges is a Dialect key, beside frames, not inside one frame (an edge names both its frames)`, `move it up: edges(record) { return [{ from: "cell", to: "px", scale: 16, offset: 8 }]; } beside frames`);
      keys(f, FRAME_KEYS.concat("edges"), at, `frame '${n}'`, "D030");
      const dimsOk = f.dims === 1 || f.dims === 2 || f.dims === 3;
      if (!dimsOk) add("D030", [...at, "dims"], `frame '${n}': dims is 1 (a unit: metres), 2 or 3 (a space), not ${show(f.dims)}`, "dims: 2");
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
    if (!r.ok) { add("D025", [...at, "seam"], `${what}: the seam ${show(p.seam)} does not parse: ${r.error}`, 'write a seam type such as "f64", "point2@cell", "vec2@px/s" or "Event<{ at: point2@cell }>"'); return null; }
    let ok = true;
    for (const f of framesOf(r.type)) {
      if (frameNamed(f)) continue;
      ok = false;
      if (declaredFrames.has(f)) continue; // its D030 says what is wrong
      const known = Object.keys(seams.frames);
      add("D025", [...at, "seam"], `${what}: the seam ${printSeam(r.type)} names the frame '${f}', which this Dialect does not declare.${didYouMean(f, [...known, ...Object.keys(KIT_FRAMES)])}`, known.length ? `use one of: ${known.join(", ")}, or declare frames: { ${f}: { dims, note } }` : `declare it: frames: { ${f}: { dims: 2, note: "…" } }`);
    }
    for (const { field, seam } of leavesOf(r.type)) {
      const fr = (seam.kind === "point" || seam.kind === "vector") && seam.frame !== null ? frameNamed(seam.frame) : undefined;
      if (fr && (seam.kind === "point" || seam.kind === "vector") && fr.dims !== seam.dims) {
        ok = false;
        add("D025", [...at, "seam"], `${what}: ${field ? `the field '${field}' is` : "the seam is"} ${printSeam(seam)}, but the frame '${fr.name}' has ${fr.dims} dims`, fr.dims === 1 && seam.kind === "vector" ? `a 1-D frame measures a position (point1@${fr.name}) or a quantity (f64@${fr.name}); a vector needs a frame of 2 or 3 dims` : `write ${seam.kind === "point" ? "point" : "vec"}${fr.dims}@${fr.name}, or tag it with a frame of ${seam.dims} dims`);
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
        if (UNNAMEABLE.includes(n)) { add("D024", at, `the port name '${n}' ${unnameableWhy(n)}`, "rename the port"); continue; }
        if (!isObj(p)) { add("D024", at, `${what} is { seam, … }, not ${show(p)}`, `${n}: { seam: "f64"${side === "out" ? `, from: "${n}"` : ", default: 0"} }`); continue; }
        keys(p, side === "out" ? OUT_KEYS : IN_KEYS, at, what, "D024");
        const seam = seamOf(p, at, what);
        if (seam === null) continue;
        defaultsOf(seam, side, at, what);
        const nt = note(p, seam, at, what);
        if (side === "out") outputOf(n, p, seam, nt, at, what);
        else inputOf(n, p, seam, nt, at, what);
      }
    }
  }

  /**
   * Judges a seam's record field defaults (Ben, 2026-11-26): only a top-level field of an Event input's record may
   * take one, the wire filling it when the producer's record lacks the field, and it must fit the field's type.
   * @param {Seam} seam @param {"out" | "in"} side @param {Array<string | number>} at @param {string} what
   */
  function defaultsOf(seam, side, at, what) {
    const where = [...at, "seam"];
    const top = seam.kind === "event" && side === "in" ? seam.of : null;
    /** @param {Seam} s @param {string} path */
    const walk = (s, path) => {
      if (s.kind === "event" || s.kind === "list") { walk(s.of, path); return; }
      if (s.kind !== "record") return;
      for (const [k, v] of Object.entries(s.defaults ?? {})) {
        const field = path ? `${path}.${k}` : k;
        if (s !== top) {
          const why = side === "out" ? "an output's record is what its runtime pushes, so it has no defaults" : seam.kind !== "event" ? "a value input takes a whole default (default: …), not one per field" : "only a top-level field of the record may take one: a wire fills a field the producer's record lacks";
          add("D028", where, `${what}: the field '${field}' declares a default (= ${printValue(v)}); ${why}`, `remove = ${printValue(v)}`);
          continue;
        }
        const bad = fits(s.fields[k], v);
        if (bad) add("D028", where, `${what}: the default of the field '${field}' (= ${printValue(v)}) does not fit ${printSeam(s.fields[k])}: ${bad}`, s.fields[k].kind === "record" ? `a record-typed field takes no default: remove = ${printValue(v)}` : `${k}: ${printSeam(s.fields[k])} = ${sampleDefault(s.fields[k])}`);
      }
      for (const [k, v] of Object.entries(s.fields)) walk(v, path ? `${path}.${k}` : k);
    };
    walk(seam, "");
  }

  /** @param {string} n @param {any} p @param {Seam} seam @param {string | null} nt @param {Array<string | number>} at @param {string} what */
  function outputOf(n, p, seam, nt, at, what) {
    if (seam.kind === "event") {
      // ruled 2026-11-26 (the clocks draft, question 3): a runtime pushes an Event output's records in its step
      if (p.from !== undefined) { add("D026", [...at, "from"], `${what} is an Event output, so it has no from: a runtime pushes its records in its step, and the kit reads nothing from the run's state for it`, "remove from"); return; }
      seams.out[n] = { name: n, seam, seamText: printSeam(seam), note: nt };
      return;
    }
    if (p.from === undefined) { add("D024", at, `${what} has no from: a path into the run's state, or a value lambda (s) => …`, `from: "${n}"`); return; }
    if (typeof p.from !== "string" && typeof p.from !== "function") { add("D026", [...at, "from"], `${what}: from is a path into the run's state ("player.at") or a value lambda (s) => …, not ${show(p.from)}`, `from: "${n}"`); return; }
    seams.out[n] = { name: n, seam, seamText: printSeam(seam), from: p.from, note: nt };
  }

  /** @param {string} n @param {any} p @param {Seam} seam @param {string | null} nt @param {Array<string | number>} at @param {string} what */
  function inputOf(n, p, seam, nt, at, what) {
    /** @type {InPort} */
    const port = { name: n, seam, seamText: printSeam(seam), note: nt, required: p.required === true };
    if (seam.kind === "event") {
      if (p.default !== undefined || p.required !== undefined) add("D028", at, `${what} is an Event input: its records arrive each step, so it takes neither a default nor required`, "remove default and required");
      port.delivery = deliveryOf(p.delivery, at, what);
      if (p.record !== undefined) {
        const r = recordOf(n, p, seam, at, what);
        if (r) { port.record = { name: r.name, slots: r.slots }; records.push(r); }
      } else if (p.type !== undefined) add("D024", [...at, "type"], `${what} is an Event input whose record no lambda reads, so it has no type`, "remove type, or give it a record: { name, slots }");
    } else {
      if (p.delivery !== undefined) add("D028", [...at, "delivery"], `${what} is a value input; only an Event input has a delivery (a value input reads its producer's latest value)`, "remove delivery");
      if (p.record !== undefined) add("D032", [...at, "record"], `${what} is a value input, read through the inputs object; only an Event input has a record`, "remove record");
      if (p.required !== undefined && p.required !== true) add("D028", [...at, "required"], `${what}: required is true or left out, not ${show(p.required)}`, "required: true");
      const has = p.default !== undefined, req = p.required === true;
      if (has === req) add("D028", at, has ? `${what} has both a default and required: true; a required input has no default to read` : `${what} has neither a default nor required: true; an unwired value input reads its default`, has ? "remove one of them" : `default: ${sampleDefault(seam)}, or required: true`);
      else if (has) { const why = fits(seam, p.default); if (why) add("D028", [...at, "default"], `${what}: the default ${show(p.default)} does not fit ${printSeam(seam)}: ${why}`, `default: ${sampleDefault(seam)}`); }
      if (has) port.default = p.default;
      const member = localOf(def, p.type, seam, at, what, add);
      if (member !== undefined) members[n] = member;
    }
    seams.in[n] = port;
  }

  /** An Event input's delivery, "reliable" when it declares none. @param {unknown} d @param {Array<string | number>} at @param {string} what @returns {InPort["delivery"]} */
  function deliveryOf(d, at, what) {
    if (d === undefined || d === RELIABLE) return RELIABLE;
    if (isObj(d) && Object.keys(d).length === 1 && Number.isInteger(d.keepLast) && d.keepLast > 0) return { keepLast: d.keepLast };
    add("D028", [...at, "delivery"], `${what}: delivery is "reliable" (every record, the default) or { keepLast: n } (the newest n, n a positive whole number), not ${show(d)}`, 'delivery: "reliable", or delivery: { keepLast: 8 }');
    return RELIABLE;
  }

  /**
   * An Event input's record as lambdas read it: `record: { name, slots }`, the global it is read by and the slot
   * conventions whose lambdas see it.
   * @param {string} n @param {any} p @param {Seam} seam @param {Array<string | number>} at @param {string} what @returns {EventRecord | null}
   */
  function recordOf(n, p, seam, at, what) {
    const r = p.record;
    const rat = [...at, "record"];
    const tip = 'record: { name: "ev", slots: ["spawn"] }';
    if (!isObj(r)) { add("D032", rat, `${what}: record is { name, slots }, the name its lambdas read the record by and the slot conventions whose lambdas see it, not ${show(r)}`, tip); return null; }
    keys(r, RECORD_KEYS, rat, `${what}'s record`, "D032");
    const conventions = isObj(def.slots) ? Object.keys(def.slots) : [];
    let ok = true;
    if (typeof r.name !== "string" || !IDENT.test(r.name)) { add("D032", [...rat, "name"], `${what}: record.name is the name lambdas read the record by, an identifier, not ${show(r.name)}`, tip); ok = false; }
    else {
      const taken = r.name === def.inputs?.name ? "the inputs object's name" : r.name === def.params?.name ? "the params' name"
        : isObj(def.globals) && Object.hasOwn(def.globals, r.name) ? "a global" : isObj(def.objects) && Object.hasOwn(def.objects, r.name) ? "an object"
        : isObj(def.intrinsics) && Object.hasOwn(def.intrinsics, r.name) ? "an intrinsic" : isObj(def.types) && Object.hasOwn(def.types, r.name) ? "a type"
        : records.some((x) => x.name === r.name) ? `input '${records.find((x) => x.name === r.name)?.input}''s record` : null;
      if (taken) { add("D032", [...rat, "name"], `${what}: record.name '${r.name}' is already ${taken} of the ${String(def.name)} Dialect`, `pick another name, such as ${n}Ev`); ok = false; }
    }
    if (!Array.isArray(r.slots) || r.slots.length === 0 || !r.slots.every((s) => typeof s === "string")) { add("D032", [...rat, "slots"], `${what}: record.slots lists the slot conventions whose lambdas see the record (at least one), not ${show(r.slots)}`, `slots: [${conventions.slice(0, 1).map((c) => `"${c}"`).join("")}]`); ok = false; }
    else for (const s of r.slots) if (!conventions.includes(s)) { add("D032", [...rat, "slots"], `${what}: record.slots names '${s}', which is not one of the Dialect's slot conventions.${didYouMean(s, conventions)}`, `use one of: ${conventions.join(", ")}`); ok = false; }
    const of = /** @type {Seam & { kind: "record" }} */ (/** @type {any} */ (seam).of);
    /** @type {Record<string, unknown>} */
    const fields = {};
    for (const [k, f] of Object.entries(of.fields)) {
      const t = localOf(def, p.type, f, at, `${what}'s record field '${k}'`, add);
      if (t === undefined) ok = false;
      else fields[k] = t;
    }
    return ok ? { input: n, name: r.name, slots: [...r.slots], members: fields } : null;
  }

  const values = Object.values(seams.in).filter((p) => p.seam.kind !== "event");
  if (def.inputs !== undefined) {
    const i = def.inputs;
    if (!isObj(i)) add("D029", ["inputs"], `inputs is { object, name }, not ${show(i)}`, 'inputs: { object: "In", name: "inp" }');
    else {
      keys(i, ["object", "name"], ["inputs"], "inputs", "D029");
      const objects = isObj(def.objects) ? def.objects : {};
      const globals = isObj(def.globals) ? def.globals : {};
      const objectOk = typeof i.object === "string" && Object.hasOwn(objects, i.object);
      if (!objectOk) add("D029", ["inputs", "object"], `inputs.object ${show(i.object)} is not one of the Dialect's objects.${typeof i.object === "string" ? didYouMean(i.object, Object.keys(objects)) : ""}`, `declare it, empty: objects: { ${typeof i.object === "string" ? i.object : "In"}: { label: "the inputs (inp)", members: {} } }`);
      else if (isObj(objects[i.object]?.members) && Object.keys(objects[i.object].members).length) add("D029", ["objects", i.object, "members"], `the inputs object '${i.object}' declares members itself; the kit fills it from ports.in`, `members: {}`);
      if (typeof i.name !== "string" || !IDENT.test(i.name)) add("D029", ["inputs", "name"], `inputs.name is the global lambdas read the inputs through, an identifier, not ${show(i.name)}`, 'name: "inp"');
      // a global naming a missing object is that object's mistake, said once above
      else if (objectOk && globals[i.name] !== i.object) add("D029", ["globals"], `there is no global '${i.name}' naming the object ${show(i.object)}; lambdas read value inputs through it`, `globals: { …, ${i.name}: ${show(i.object)} }`);
      if (typeof i.object === "string" && typeof i.name === "string") seams.inputs = { object: i.object, name: i.name };
    }
  } else if (values.length) {
    add("D029", ["ports", "in", values[0].name], `the value input '${values[0].name}' is read in lambdas through an inputs object, and the Dialect declares none`, 'inputs: { object: "In", name: "inp" }, with objects: { In: { label: "the inputs (inp)", members: {} } } and globals: { inp: "In" }');
  }
  return { problems: out, seams, members, records };
}

/**
 * The local type a seam reads as in a lambda (an input's member, an Event record's field): a point or a vector
 * takes one of the Dialect's vector types of its dims (`type` names it when there are several).
 * @param {Record<string, any>} def @param {unknown} type  the port's `type` @param {Seam} seam @param {Array<string | number>} at @param {string} what
 * @param {(code: string, path: Array<string | number>, message: string, tip: string) => void} add
 * @returns {unknown}  undefined when it has none (an Event, or a vector with no type to read as)
 */
function localOf(def, type, seam, at, what, add) {
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
        if (s.kind === "point" && s.dims === 1) return "f64";
        const found = vectors(s.dims);
        if (type !== undefined) {
          if (typeof type === "string" && found.includes(type)) return type;
          add("D027", [...at, "type"], `${what}: type ${show(type)} is not one of the Dialect's vector(${s.dims}, "f64") types${found.length ? `: ${found.join(", ")}` : ""}`, found.length ? `type: "${found[0]}"` : `declare one: types: { vec${s.dims}: vector(${s.dims}, "f64") }`);
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
    case "point": case "vector": return s.kind === "point" && s.dims === 1 ? "0" : `[${Array(s.dims).fill(0).join(", ")}]`;
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
    case "point": case "vector":
      if (s.kind === "point" && s.dims === 1) return num(v) ? null : "it is not a finite number";
      return Array.isArray(v) && v.length === s.dims && v.every(num) ? null : `it is not an array of ${s.dims} numbers`;
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
 * Judges the value outputs against the Dialect's resolved state: a path must name something there, and the type
 * there must pair with the seam; a lambda must keep the UI value lambda rules (what it gives is judged when a
 * Program lowers, port-lower.js).
 * @param {Seams} seams @param {Record<string, any>} def @param {Type | undefined} state  the resolved run's state
 * @returns {Problem[]}
 */
export function checkOutputs(seams, def, state) {
  /** @type {Problem[]} */
  const out = [];
  const ctx = lambdaContext(def, state ?? null);
  for (const p of Object.values(seams.out)) {
    if (p.from === undefined) continue;
    const at = ["ports", "out", p.name, "from"];
    const what = `output '${p.name}'`;
    if (!state) { out.push({ code: "D026", path: at, message: `${what} reads the run's state, and the Dialect declares none`, tip: 'declare it: state: { t: "f64", … }' }); continue; }
    if (typeof p.from === "function") {
      for (const lp of checkLambda(p.from, ctx)) out.push({ code: "D026", path: at, message: `${what}'s lambda, line ${lp.line}: ${lp.message}`, tip: lp.fix });
      continue;
    }
    const r = resolvePath(state, p.from, ctx.aliases);
    if ("error" in r) { out.push({ code: "D026", path: at, message: `${what}: ${r.error}`, tip: r.fix.replace(/show '([^']*)' in a table.*/, "point from at the list itself") }); continue; }
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

/** Each input's or output's and frame's name, by side, for the handles. @param {Seams} s */
export const sideNames = (s) => ({ out: Object.keys(s.out), in: Object.keys(s.in), frame: Object.keys(s.frames) });
