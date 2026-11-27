// Declared Controls (project/2026-11-27-controls-draft.md, "The kinds"): the closed table of interaction kinds, the
// record seam each kind makes, its class (state or delta) and its default perFrame, the pointer's seam, and the U017
// checks of one declaration. A kind is UI vocabulary, never a workbench's: the names of a Control's buttons, options
// and keys are the package's.

import { didYouMean } from "../codes.js";

/** The kinds, in the table's order. */
export const CONTROL_KINDS = Object.freeze(["buttons", "toggle", "number", "vector", "color", "choice", "text", "pick", "points", "triggers"]);

/** The keys every kind takes. */
const COMMON = ["kind", "label", "note", "perFrame", "latency", "each", "to"];

/** Each kind's own keys: the required ones, then the optional ones. @type {Record<string, { req: string[], opt: string[] }>} */
export const KIND_KEYS = {
  buttons: { req: ["buttons"], opt: ["grid", "keys", "gamepad"] },
  toggle: { req: ["value"], opt: ["keys"] },
  number: { req: ["min", "max", "value"], opt: ["step", "curve", "look", "keys", "gamepad", "midi"] },
  vector: { req: ["dims", "min", "max", "value"], opt: [] },
  color: { req: ["value"], opt: [] },
  choice: { req: ["options", "value"], opt: ["look", "keys"] },
  text: { req: [], opt: ["value", "max", "lines"] },
  pick: { req: ["file", "key", "value"], opt: ["show", "map", "carry"] },
  points: { req: ["max", "x", "y", "value"], opt: ["look"] },
  triggers: { req: ["count"], opt: ["first", "keys", "midi"] },
};

/** The shape of each required key, as U017's fix writes it, in placeholders. @type {Record<string, string>} */
const REQ_SHAPE = { buttons: '["<button>", …]', value: "<value>", min: "<number>", max: "<number>", dims: "2", options: '["<option>", …]', file: '"<data file>"', key: '"<column>"', x: '"<column>"', y: '"<column>"', count: "<number of triggers>" };

/** The records one Control sends in a display frame, unless its declaration raises it. */
export const PER_FRAME = Object.freeze({ buttons: 2, triggers: 32 });
/** A kind's default perFrame. @param {string} kind */
export const perFrameOf = (kind) => /** @type {Record<string, number>} */ (PER_FRAME)[kind] ?? 1;
/** The kinds whose records are deltas, which carry over and are never folded; every other kind sends state. */
export const DELTA_KINDS = Object.freeze(["triggers"]);
/** @param {string} kind @returns {"state" | "delta"} */
export const recordsOf = (kind) => (DELTA_KINDS.includes(kind) ? "delta" : "state");
/** The one latency class a Control may declare: straight to a part at its own rate, past the frame loop. */
export const LATENCIES = Object.freeze(["direct"]);

const IDENT = /^[A-Za-z_$][\w$]*$/;
/** A KeyboardEvent.code. */
export const CODE = /^[A-Z][A-Za-z0-9]+$/;
const LOOKS = { number: ["slider", "knob", "field"], choice: ["menu", "tabs", "radio"], points: ["curve", "list"] };
const CURVES = ["linear", "log"];

/** A string as a seam's enum writes it: `'sine'`. @param {string} s */
const quoted = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/**
 * The record seam a Control of this declaration makes (`Event<{ … }>`), with `key: str` first when it is keyed.
 * The declaration is taken as checked; a missing piece makes the narrowest seam it can.
 * @param {Record<string, any>} c
 */
export function controlSeam(c) {
  /** @type {string[]} */
  let fields;
  switch (c.kind) {
    case "buttons": fields = (Array.isArray(c.buttons) ? c.buttons : []).map((/** @type {string} */ b) => `${b}: bool`); break;
    case "toggle": fields = ["value: bool"]; break;
    case "number": fields = ["value: f64"]; break;
    case "vector": fields = [`value: vec${c.dims === 3 ? 3 : 2}`]; break;
    case "color": fields = ["value: vec3"]; break;
    case "choice": fields = [`value: ${(Array.isArray(c.options) ? c.options : []).map((/** @type {string} */ o) => quoted(String(o))).join(" | ")}`]; break;
    case "text": fields = ["value: str"]; break;
    case "pick": fields = ["value: str", ...Object.entries(c.carry ?? {}).map(([k, t]) => `${k}: ${t}`)]; break;
    case "points": fields = [`value: list<vec2, ${c.max}>`]; break;
    case "triggers": fields = ["index: f64", "on: bool", "velocity: f64"]; break;
    default: fields = [];
  }
  return `Event<{ ${[...(c.each !== undefined ? ["key: str"] : []), ...fields].join(", ")} }>`;
}

/** The pointer's seam on a Draw output measured in `frame` (requirement 5). @param {string} frame */
export const pointerSeam = (frame) => `Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@${frame}, pointer: f64, buttons: f64, clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>`;

/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string }} Problem */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** @param {unknown} v */
const num = (v) => typeof v === "number" && Number.isFinite(v);
/** @param {unknown} v */
const whole = (v) => num(v) && Number.isInteger(/** @type {number} */ (v));
/** @param {unknown} v */
function str(v) { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } }

/**
 * The U017 problems of one Control's declaration (or one `each` instance, merged over it). `files` is the Dialect's
 * data files, by name; `instance` is set for an `each` entry, whose `key` it requires.
 * @param {unknown} c @param {Array<string | number>} at @param {{ files: Record<string, any>, instance?: boolean }} env
 * @returns {Problem[]}
 */
export function controlProblems(c, at, env) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {Array<string | number>} */ path, /** @type {string} */ message, /** @type {string} */ tip) => { out.push({ code: "U017", path, message, tip }); };
  const name = String(at[1] ?? "the Control");
  if (!isObj(c)) { add(at, `the Control '${name}' is ${str(c)}, not an object`, `write ${name}: { kind: "<kind>", … }`); return out; }
  if (!("kind" in c)) { add(at, `the Control '${name}' needs 'kind'`, `add kind: one of ${CONTROL_KINDS.join(", ")}`); return out; }
  const kind = c.kind;
  if (typeof kind !== "string" || !CONTROL_KINDS.includes(kind)) { add([...at, "kind"], `${str(kind)} is not a Control kind.${typeof kind === "string" ? didYouMean(kind, [...CONTROL_KINDS]) : ""}`, `use one of: ${CONTROL_KINDS.join(", ")}`); return out; }
  const spec = KIND_KEYS[kind];
  const allowed = [...COMMON, ...spec.req, ...spec.opt, ...(env.instance ? ["key"] : [])];
  for (const k of Object.keys(c)) {
    if (allowed.includes(k)) continue;
    add([...at, k], `a ${kind} Control has no key '${k}'.${didYouMean(k, allowed)}`, `use: ${allowed.filter((x) => x !== "kind").join(", ")}`);
  }
  for (const k of spec.req) if (!(k in c)) add(at, `the ${kind} Control '${name}' needs '${k}'`, `add ${k}: ${REQ_SHAPE[k] ?? "…"} (kit/define/README.md, "The kinds": each kind's keys and record)`);
  const k = (/** @type {string} */ key) => [...at, key];
  for (const key of ["label", "note"]) if (key in c && typeof c[key] !== "string") add(k(key), `${key} is ${str(c[key])}, not a string`, `write ${key}: "…"`);
  if ("perFrame" in c && !(whole(c.perFrame) && c.perFrame >= 1)) add(k("perFrame"), `perFrame is ${str(c.perFrame)}; it takes a whole number of at least 1 (the records one Control sends in a display frame)`, "write perFrame: 4");
  if ("latency" in c && !LATENCIES.includes(c.latency)) add(k("latency"), `latency is ${str(c.latency)}; the one latency class is "direct"`, `write latency: "direct", or leave it out`);
  if ("each" in c && !env.instance && typeof c.each !== "function") add(k("each"), `each is ${str(c.each)}, not a function of the built record`, "write each: (record) => [{ key: \"<key>\", … }]");
  if ("to" in c && !(typeof c.to === "string" && /^(param|arg)\./.test(c.to))) add(k("to"), `to is ${str(c.to)}; a target is "param.<name>" or "arg.<address>"`, 'write to: "param.<name>"');
  if (env.instance && !(typeof c.key === "string" && c.key.length > 0)) add(k("key"), `an each instance's key is ${str(c.key)}, not a string`, "give each instance key: \"<key>\"");
  // a device (a key, a gamepad, a MIDI message) sends a record with no key, which a keyed input refuses (N012)
  if ("each" in c || env.instance) for (const device of ["keys", "gamepad", "midi"]) if (device in c) add(k(device), `a keyed Control (each) takes no ${device}: a device's record carries no key, so it cannot say which instance it plays`, `play each instance on screen, or declare one Control per instance with its own ${device}`);
  const codes = (/** @type {unknown} */ v, /** @type {Array<string | number>} */ p) => {
    if (!Array.isArray(v) || v.length === 0) { add(p, `${str(v)} is not a list of KeyboardEvent codes`, 'write ["KeyA"]'); return; }
    for (const [i, code] of v.entries()) if (typeof code !== "string" || !CODE.test(code)) add([...p, i], `${str(code)} is not a KeyboardEvent.code (KeyA, ArrowUp, Space, Digit1, …)`, "write the code a key event gives, such as \"KeyA\"");
  };
  /** A range [lo, hi] whose value must sit inside: min below max. */
  const range = () => {
    if ("min" in c && !num(c.min)) add(k("min"), `min is ${str(c.min)}, not a number`, "write min: 0");
    if ("max" in c && !num(c.max)) add(k("max"), `max is ${str(c.max)}, not a number`, "write max: 1");
    if (num(c.min) && num(c.max) && !(c.min < c.max)) add(k("max"), `min ${c.min} is not below max ${c.max}`, "write min below max");
  };
  const inRange = (/** @type {unknown} */ v, /** @type {Array<string | number>} */ p) => {
    if (!num(v)) return add(p, `${str(v)} is not a number`, "write a number from min to max");
    if (num(c.min) && num(c.max) && (/** @type {number} */ (v) < c.min || /** @type {number} */ (v) > c.max)) add(p, `${v} is outside ${c.min}..${c.max}`, `write a value from ${c.min} to ${c.max}`);
  };
  const midi = (/** @type {unknown} */ m, /** @type {"cc" | "notes"} */ want) => {
    if (!isObj(m)) return add(k("midi"), `midi is ${str(m)}, not an object`, want === "cc" ? "write midi: { cc: 74 }" : "write midi: { notes: true }");
    const keys = [want, "channel"];
    for (const x of Object.keys(m)) if (!keys.includes(x)) add([...k("midi"), x], `midi has no key '${x}'`, `use ${keys.join(", ")}`);
    if (want === "cc" && !(whole(m.cc) && m.cc >= 0 && m.cc <= 127)) add([...k("midi"), "cc"], `midi.cc is ${str(m.cc)}; a MIDI number is 0..127`, "write cc: 74");
    if (want === "notes" && m.notes !== true) add([...k("midi"), "notes"], `midi.notes is ${str(m.notes)}, not true`, "write notes: true");
    if ("channel" in m && !(whole(m.channel) && m.channel >= 1 && m.channel <= 16)) add([...k("midi"), "channel"], `midi.channel is ${str(m.channel)}; a channel is 1..16`, "write channel: 1");
  };
  const look = (/** @type {string[]} */ looks) => { if ("look" in c && !looks.includes(c.look)) add(k("look"), `look is ${str(c.look)}; a ${kind} looks like ${looks.join(", ")}`, `write look: "${looks[0]}"`); };
  switch (kind) {
    case "buttons": {
      const bs = c.buttons;
      if (!Array.isArray(bs) || bs.length < 1 || bs.length > 16) { if ("buttons" in c) add(k("buttons"), `buttons is ${str(bs)}; it takes a list of 1 to 16 button names`, 'write buttons: ["<button>", …]'); break; }
      const seen = new Set();
      for (const [i, b] of bs.entries()) {
        if (typeof b !== "string" || !IDENT.test(b)) add([...k("buttons"), i], `${str(b)} is not a button name: a button is an identifier`, "name it with letters, digits and _");
        else if (seen.has(b)) add([...k("buttons"), i], `the button '${b}' is named twice`, "name each button once");
        seen.add(b);
      }
      if ("grid" in c) {
        const placed = new Set();
        if (!Array.isArray(c.grid) || !c.grid.every(Array.isArray)) add(k("grid"), `grid is ${str(c.grid)}; it takes rows of button names or null`, 'write grid: [[null, "<button>", null], …]');
        else for (const [r, row] of c.grid.entries()) for (const [j, cell] of row.entries()) {
          if (cell === null) continue;
          if (!seen.has(cell)) add([...k("grid"), r, j], `the grid names ${str(cell)}, which is not one of the buttons (${bs.join(", ")})`, "name a declared button, or null for a gap");
          else if (placed.has(cell)) add([...k("grid"), r, j], `the grid places '${cell}' twice`, "place each button once");
          placed.add(cell);
        }
      }
      if ("keys" in c) {
        if (!isObj(c.keys)) add(k("keys"), `keys is ${str(c.keys)}; it takes { <button>: ["<code>", …] }`, 'write keys: { <button>: ["KeyX"] }');
        else for (const [b, v] of Object.entries(c.keys)) { if (!seen.has(b)) add([...k("keys"), b], `keys names '${b}', which is not one of the buttons.${didYouMean(b, [...seen])}`, "key a declared button"); codes(v, [...k("keys"), b]); }
      }
      if ("gamepad" in c) {
        if (!isObj(c.gamepad)) add(k("gamepad"), `gamepad is ${str(c.gamepad)}; it takes { <button>: <index> }`, "write gamepad: { <button>: 0 }");
        else for (const [b, v] of Object.entries(c.gamepad)) {
          if (!seen.has(b)) add([...k("gamepad"), b], `gamepad names '${b}', which is not one of the buttons`, "map a declared button");
          if (!(whole(v) && v >= 0 && v <= 63)) add([...k("gamepad"), b], `${str(v)} is not a gamepad button index (the standard layout's, 0..63)`, "write 0");
        }
      }
      break;
    }
    case "toggle":
      if ("value" in c && typeof c.value !== "boolean") add(k("value"), `value is ${str(c.value)}, not true or false`, "write value: false");
      if ("keys" in c) codes(c.keys, k("keys"));
      break;
    case "number":
      range();
      if ("value" in c) inRange(c.value, k("value"));
      if ("step" in c && !(num(c.step) && c.step > 0)) add(k("step"), `step is ${str(c.step)}; it takes a number above 0`, "write step: 0.1");
      if ("curve" in c && !CURVES.includes(c.curve)) add(k("curve"), `curve is ${str(c.curve)}; it is "linear" or "log"`, 'write curve: "log"');
      if (c.curve === "log" && num(c.min) && c.min <= 0) add(k("curve"), `a log curve needs min above 0, and min is ${c.min}: a log knob has no zero`, "give min a small floor above 0, or use curve: \"linear\"");
      look(LOOKS.number);
      if ("keys" in c) {
        if (!isObj(c.keys)) add(k("keys"), `keys is ${str(c.keys)}; it takes { down: [...], up: [...] }`, 'write keys: { down: ["Minus"], up: ["Equal"] }');
        else for (const [d, v] of Object.entries(c.keys)) { if (!["down", "up"].includes(d)) add([...k("keys"), d], `keys has no '${d}': a number's keys are down and up`, "use down and up"); codes(v, [...k("keys"), d]); }
      }
      if ("gamepad" in c && !(isObj(c.gamepad) && Object.keys(c.gamepad).every((x) => x === "axis") && whole(c.gamepad.axis) && c.gamepad.axis >= 0)) add(k("gamepad"), `gamepad is ${str(c.gamepad)}; a number takes { axis: <index> }`, "write gamepad: { axis: 0 }");
      if ("midi" in c) midi(c.midi, "cc");
      break;
    case "vector":
      if ("dims" in c && c.dims !== 2 && c.dims !== 3) add(k("dims"), `dims is ${str(c.dims)}; a vector has 2 or 3`, "write dims: 2");
      range();
      if ("value" in c) {
        if (!Array.isArray(c.value) || c.value.length !== (c.dims === 3 ? 3 : 2)) add(k("value"), `value is ${str(c.value)}, not ${c.dims === 3 ? 3 : 2} numbers`, "write value: [0, 0]");
        else c.value.forEach((/** @type {unknown} */ v, /** @type {number} */ i) => inRange(v, [...k("value"), i]));
      }
      break;
    case "color":
      if ("value" in c && !(Array.isArray(c.value) && c.value.length === 3 && c.value.every((/** @type {unknown} */ v) => num(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= 1))) add(k("value"), `value is ${str(c.value)}; a color is [<r>, <g>, <b>], each from 0 to 1`, "write value: [1, 0.5, 0]");
      break;
    case "choice": {
      const opts = c.options;
      if ("options" in c && !(Array.isArray(opts) && opts.length > 0 && opts.every((o) => typeof o === "string" && o.length > 0) && new Set(opts).size === opts.length)) add(k("options"), `options is ${str(opts)}; it takes a list of distinct strings`, 'write options: ["<option>", …]');
      else if ("value" in c && Array.isArray(opts) && !opts.includes(c.value)) add(k("value"), `value ${str(c.value)} is not among the options (${opts.join(", ")})`, `write value: "${opts[0]}"`);
      look(LOOKS.choice);
      if ("keys" in c) {
        if (!isObj(c.keys)) add(k("keys"), `keys is ${str(c.keys)}; it takes { prev: [...], next: [...] }`, 'write keys: { prev: ["BracketLeft"], next: ["BracketRight"] }');
        else for (const [d, v] of Object.entries(c.keys)) { if (!["prev", "next"].includes(d)) add([...k("keys"), d], `keys has no '${d}': a choice's keys are prev and next`, "use prev and next"); codes(v, [...k("keys"), d]); }
      }
      break;
    }
    case "text":
      if ("value" in c && typeof c.value !== "string") add(k("value"), `value is ${str(c.value)}, not a string`, 'write value: ""');
      for (const key of ["max", "lines"]) if (key in c && !(whole(c[key]) && c[key] >= 1)) add(k(key), `${key} is ${str(c[key])}; it takes a whole number of at least 1`, `write ${key}: 1`);
      if (typeof c.value === "string" && whole(c.max) && c.value.length > c.max) add(k("value"), `value has ${c.value.length} characters, more than max ${c.max}`, "shorten it, or raise max");
      break;
    case "pick":
      if ("file" in c && !(typeof c.file === "string" && Object.hasOwn(env.files, c.file))) add(k("file"), `file is ${str(c.file)}; it names one of the Dialect's data files (${Object.keys(env.files).join(", ") || "it declares none"}).${typeof c.file === "string" ? didYouMean(c.file, Object.keys(env.files)) : ""}`, `declare it in defineDialect: files: { <file>: { kind: "csv", path: "<path>.csv", note: "…" } }`);
      for (const key of ["key", "value"]) if (key in c && typeof c[key] !== "string") add(k(key), `${key} is ${str(c[key])}, not a string`, `write ${key}: "<column>"`);
      if ("show" in c && !(Array.isArray(c.show) && c.show.every((s) => typeof s === "string"))) add(k("show"), `show is ${str(c.show)}; it takes a list of column names`, 'write show: ["<column>"]');
      if ("map" in c && !(isObj(c.map) && typeof c.map.x === "string" && typeof c.map.y === "string" && Object.keys(c.map).length === 2)) add(k("map"), `map is ${str(c.map)}; it takes { x: "<column>", y: "<column>" }`, 'write map: { x: "<column>", y: "<column>" }');
      if ("carry" in c && !(isObj(c.carry) && Object.entries(c.carry).every(([col, t]) => IDENT.test(col) && col !== "value" && col !== "key" && (t === "f64" || t === "str")))) add(k("carry"), `carry is ${str(c.carry)}; it takes { <column>: "f64" | "str" }`, 'write carry: { <column>: "f64" }');
      break;
    case "points": {
      if ("max" in c && !(whole(c.max) && c.max >= 1)) add(k("max"), `max is ${str(c.max)}; it takes a whole number of at least 1`, "write max: 8");
      const pair = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 2 && v.every(num);
      for (const axis of ["x", "y"]) if (axis in c && !(pair(c[axis]) && c[axis][0] < c[axis][1])) add(k(axis), `${axis} is ${str(c[axis])}; it takes [<min>, <max>], min below max`, `write ${axis}: [0, 1]`);
      if ("value" in c) {
        if (!(Array.isArray(c.value) && c.value.every(pair))) add(k("value"), `value is ${str(c.value)}; it takes a list of [<x>, <y>] points`, "write value: [[0, 0], [1, 1]]");
        else if (whole(c.max) && c.value.length > c.max) add(k("value"), `value has ${c.value.length} points, more than max ${c.max}`, "remove points, or raise max");
      }
      look(LOOKS.points);
      break;
    }
    case "triggers":
      if ("count" in c && !(whole(c.count) && c.count >= 1 && c.count <= 128)) add(k("count"), `count is ${str(c.count)}; it takes a whole number from 1 to 128`, "write count: 12");
      if ("first" in c && !(whole(c.first) && c.first >= 0 && c.first <= 127)) add(k("first"), `first is ${str(c.first)}; it takes a whole number from 0 to 127`, "write first: 60");
      if ("keys" in c) { codes(c.keys, k("keys")); if (Array.isArray(c.keys) && whole(c.count) && c.keys.length > c.count) add(k("keys"), `keys has ${c.keys.length} codes, more than count ${c.count}`, "give at most one code per trigger"); }
      if ("midi" in c) midi(c.midi, "notes");
      break;
  }
  return out;
}

/**
 * Every key code a Control's declaration binds, with what it binds: `<button>`, `down`, `prev`, `<i>` or `value`.
 * @param {Record<string, any>} c @returns {Array<{ code: string, target: string }>}
 */
export function keyCodesOf(c) {
  const keys = c.keys;
  if (keys === undefined) return [];
  if (Array.isArray(keys)) return keys.map((code, i) => ({ code, target: c.kind === "triggers" ? String(i) : "value" }));
  return Object.entries(keys).flatMap(([t, codes]) => (Array.isArray(codes) ? codes.map((code) => ({ code, target: t })) : []));
}
