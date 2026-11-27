// A paper checker for the controls draft (project/2026-11-27-controls-draft.md): the draft's rules over a hand-in's
// plain declaration objects, since defineUI does not exist yet. It prints the draft's codes (U014..U020) and nothing else.
// It is a prototype of the validation the build will do, kept small: seams are compared by their field texts.

const BASE_KEYS = ["kind", "label", "note", "perFrame", "latency", "each", "to"];
/** @type {Record<string, { keys: string[], required: string[] }>} */
export const KINDS = {
  buttons: { keys: ["buttons", "grid", "keys", "gamepad"], required: ["buttons"] },
  toggle: { keys: ["value", "keys"], required: ["value"] },
  number: { keys: ["min", "max", "value", "step", "curve", "look", "keys", "gamepad", "midi"], required: ["min", "max", "value"] },
  vector: { keys: ["dims", "min", "max", "value"], required: ["dims", "min", "max", "value"] },
  color: { keys: ["value"], required: ["value"] },
  choice: { keys: ["options", "value", "look", "keys"], required: ["options", "value"] },
  text: { keys: ["value", "max", "lines"], required: [] },
  pick: { keys: ["file", "key", "show", "map", "carry", "value"], required: ["file", "key", "value"] },
  points: { keys: ["max", "x", "y", "value", "look"], required: ["max", "x", "y", "value"] },
  triggers: { keys: ["count", "first", "keys", "midi"], required: ["count"] },
};
const GRIP_KEYS = ["each", "at", "to", "kind", "axis", "center", "unit", "step", "label"];
const GRIP_KINDS = ["translate", "length", "rotate", "scale"];
const ACTION_KEYS = ["label", "module", "export", "gives"];
const UI_KEYS = ["controls", "grips", "actions", "stage", "tiles", "annotate", "title"];
const POINTER_FIELDS = {
  phase: "'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave'", at: "point2", pointer: "f64", buttons: "f64", clicks: "f64",
  wheel: "vec2", hit: "str", shift: "bool", alt: "bool", meta: "bool",
};
const DIRECTIONS = ["splitRight", "splitLeft", "splitAbove", "splitBelow", "tabWith"];
const VIEWS = ["stage", "controls", "editor", "text", "params", "traces", "events", "ir", "graph", "code", "diagnostics", "reference", "presets", "agent", "book"];
const CODE = /^[A-Z][A-Za-z0-9]+$/;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const TARGET = /^(param\.[A-Za-z_]\w*|arg\.[^\s:]+:\d+(\.[A-Za-z_]\w*|\[\d+\])*)$/;

/**
 * Splits a seam's field list at top-level commas.
 * @param {string} text e.g. "Event<{ a: bool, b: list<vec2, 8> }>"
 * @returns {Record<string, string> | null} field name to normalized type text, or null when it is not an Event seam
 */
export function seamFields(text) {
  const m = /^\s*Event<\{([\s\S]*)\}>\s*$/.exec(text);
  if (!m) return null;
  /** @type {Record<string, string>} */
  const out = {};
  let depth = 0, quote = false, cur = "";
  const parts = [];
  for (const ch of m[1] ?? "") {
    if (ch === "'") quote = !quote;
    if (!quote && "<[(".includes(ch)) depth++;
    if (!quote && ">])".includes(ch)) depth--;
    if (ch === "," && depth === 0 && !quote) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(":");
    if (i < 0) return null;
    out[p.slice(0, i).trim()] = p.slice(i + 1).trim().replace(/\s+/g, " ").replace(/@.*$/, "");
  }
  return out;
}

/**
 * The record seam a Control's kind makes, as field texts.
 * @param {any} c
 * @returns {Record<string, string>}
 */
export function kindFields(c) {
  /** @type {Record<string, string>} */
  let f = {};
  switch (c.kind) {
    case "buttons": for (const b of Array.isArray(c.buttons) ? c.buttons : []) f[String(b)] = "bool"; break;
    case "toggle": f = { value: "bool" }; break;
    case "number": f = { value: "f64" }; break;
    case "vector": f = { value: c.dims === 3 ? "vec3" : "vec2" }; break;
    case "color": f = { value: "vec3" }; break;
    case "choice": f = { value: (Array.isArray(c.options) ? c.options : []).map((/** @type {any} */ o) => `'${o}'`).join(" | ") }; break;
    case "text": f = { value: "str" }; break;
    case "pick": f = { value: "str", ...Object.fromEntries(Object.entries(c.carry ?? {}).map(([k, t]) => [k, String(t)])) }; break;
    case "points": f = { value: `list<vec2, ${c.max}>` }; break;
    case "triggers": f = { index: "f64", on: "bool", velocity: "f64" }; break;
  }
  return f;
}

/**
 * Whether a field the Control sends fits the input's field type.
 * @param {string} sent
 * @param {string} takes
 */
function typeFits(sent, takes) {
  if (sent === takes) return true;
  if (sent.includes("'") && takes.includes("'")) {
    const set = (/** @type {string} */ s) => new Set(s.split("|").map((x) => x.trim()));
    const a = set(sent), b = set(takes);
    return [...a].every((x) => b.has(x));
  }
  const l1 = /^list<(\w+), (\d+)>$/.exec(sent), l2 = /^list<(\w+), (\d+)>$/.exec(takes);
  return !!(l1 && l2 && l1[1] === l2[1] && Number(l2[2]) >= Number(l1[2]));
}

/**
 * @param {Record<string, string>} sent
 * @param {Record<string, string>} takes
 * @returns {string[]} problems
 */
export function seamProblems(sent, takes) {
  const out = [];
  for (const [k, t] of Object.entries(takes)) {
    if (!(k in sent)) { if (!/=/.test(t)) out.push(`the input takes \`${k}\`, which the Control does not send`); continue; }
    if (!typeFits(sent[k] ?? "", t.replace(/\s*=.*$/, ""))) out.push(`field \`${k}\`: sent ${sent[k]}, the input takes ${t}`);
  }
  return out;
}

/**
 * @typedef {{ code: string, where: string, text: string }} Problem
 * @typedef {{ ports: any, files?: any, ui: any, sample?: any, gripItem?: any, validTargets?: string[] }} HandIn
 */

/**
 * Checks the declarations of one hand-in against the draft's rules.
 * @param {HandIn} h
 * @returns {Problem[]}
 */
export function checkHandIn(h) {
  /** @type {Problem[]} */
  const out = [];
  const add = (/** @type {string} */ code, /** @type {string} */ where, /** @type {string} */ text) => out.push({ code, where, text });
  const ui = h.ui ?? {};
  const inputs = h.ports?.in ?? {};
  const outputs = Object.keys(h.ports?.out ?? {});
  for (const k of Object.keys(ui)) if (!UI_KEYS.includes(k)) add("U001", k, `unknown UI key${["inputs", "emits"].includes(k) ? " (retired: write `controls`, dispatch `wb-control`)" : ""}`);

  /** @type {(c: any, where: string, instance: boolean) => void} */
  const checkDecl = (c, where, instance) => {
    const spec = KINDS[c?.kind];
    if (!spec) { add("U017", where, `unknown kind ${JSON.stringify(c?.kind)}; the kinds are ${Object.keys(KINDS).join(", ")}`); return; }
    for (const k of Object.keys(c)) if (![...BASE_KEYS, ...spec.keys, ...(instance ? ["key"] : [])].includes(k)) add("U017", where, `unknown key \`${k}\` for kind ${c.kind}`);
    for (const k of spec.required) if (!(k in c)) add("U017", where, `kind ${c.kind} needs \`${k}\``);
    if ("min" in c && "max" in c && !(c.min < c.max)) add("U017", where, "`min` is not below `max`");
    if (typeof c.value === "number" && typeof c.min === "number" && (c.value < c.min || c.value > c.max)) add("U017", where, "`value` is outside min..max");
    if (c.curve === "log" && !(c.min > 0)) add("U017", where, '`curve: "log"` needs `min` above 0');
    if (c.curve !== undefined && !["linear", "log"].includes(c.curve)) add("U017", where, "`curve` is linear or log");
    if (c.look !== undefined && c.kind === "number" && !["slider", "knob", "field"].includes(c.look)) add("U017", where, "`look` of a number is slider, knob or field");
    if (c.kind === "choice" && Array.isArray(c.options) && !c.options.includes(c.value)) add("U017", where, "`value` is not among `options`");
    if (c.kind === "buttons" && Array.isArray(c.buttons)) {
      if (c.buttons.length < 1 || c.buttons.length > 16) add("U017", where, "buttons: 1 to 16");
      if (c.buttons.some((/** @type {any} */ b) => typeof b !== "string" || !IDENT.test(b)) || new Set(c.buttons).size !== c.buttons.length) add("U017", where, "buttons must be distinct identifiers");
      if (c.grid) {
        const seen = (c.grid ?? []).flat().filter((/** @type {any} */ b) => b !== null);
        for (const b of seen) if (!c.buttons.includes(b)) add("U017", where, `grid names unknown button \`${b}\``);
        if (new Set(seen).size !== seen.length) add("U017", where, "grid names a button twice");
      }
      for (const m of ["keys", "gamepad"]) for (const b of Object.keys(c[m] ?? {})) if (!c.buttons.includes(b)) add("U017", where, `\`${m}\` names unknown button \`${b}\``);
    }
    const codes = c.keys === undefined ? [] : Array.isArray(c.keys) ? c.keys : Object.values(c.keys).flat();
    for (const code of codes) if (typeof code !== "string" || !CODE.test(code)) add("U017", where, `\`${code}\` is not a KeyboardEvent.code`);
    if (c.kind === "triggers" && Array.isArray(c.keys) && c.keys.length > c.count) add("U017", where, "more `keys` than `count`");
    if (c.midi) for (const n of [c.midi.cc, c.midi.channel]) if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 127)) add("U017", where, "a MIDI number is outside 0..127");
    if (c.perFrame !== undefined && !(Number.isInteger(c.perFrame) && c.perFrame >= 1)) add("U017", where, "`perFrame` is a whole number of at least 1");
    if (c.each !== undefined && typeof c.each !== "function") add("U017", where, "`each` is not a function");
    if (c.latency !== undefined && c.latency !== "direct") add("U017", where, '`latency` is "direct" or left out');
    if (c.kind === "pick") {
      if (!(c.file in (h.files ?? {}))) add("U017", where, `pick names file \`${c.file}\`, which the Dialect's \`files\` lacks`);
    }
    if (c.to !== undefined && !(typeof c.to === "string" && TARGET.test(c.to))) add("U017", where, `\`to\` ${JSON.stringify(c.to)} is not \`param.<name>\` or \`arg.<address>\``);
  };

  const names = Object.keys(ui.controls ?? {});
  for (const [name, c] of Object.entries(ui.controls ?? {})) {
    const where = `controls.${name}`;
    const port = inputs[name];
    if (!port && !(/** @type {any} */ (c).to) && typeof (/** @type {any} */ (c).each) !== "function") add("U015", where, `\`${name}\` is not an Event input of the Dialect${Object.keys(h.ports?.out ?? {}).includes(name) ? " (it is an output)" : ""}; inputs: ${Object.keys(inputs).join(", ")}`);
    checkDecl(c, where, false);
    if (port) {
      const takes = seamFields(String(port.seam));
      if (!takes) add("U015", where, `\`${name}\` is an input but not an Event input`);
      else {
        const sent = kindFields(c);
        if (/** @type {any} */ (c).each) sent.key = "str";
        for (const p of seamProblems(sent, takes)) add("U016", where, p);
        if (/** @type {any} */ (c).each && !("key" in takes)) add("U016", where, "a keyed Control (`each`): the input's seam must take `key: str`");
        if (!(/** @type {any} */ (c).each) && "key" in takes) add("U016", where, "the input takes `key`, and the Control has no `each`");
      }
    }
    // each, run on the sample record
    if (typeof (/** @type {any} */ (c).each) === "function" && h.sample !== undefined) {
      try {
        const list = /** @type {any} */ (c).each(h.sample);
        if (!Array.isArray(list)) add("U017", where, "`each` did not return a list");
        else {
          const keys = new Set();
          list.forEach((inst, i) => {
            const w = `${where}[${i}]`;
            if (typeof inst?.key !== "string") add("U017", w, "an instance needs a string `key`");
            else if (keys.has(inst.key)) add("U017", w, `repeated key \`${inst.key}\``); else keys.add(inst.key);
            checkDecl({ ...(/** @type {any} */ (c)), ...inst, each: undefined }, w, true);
            if (!port && !(/** @type {any} */ (c).to) && inst?.to === undefined) add("U015", w, "a part-local Control (no input of its name) needs `to`, in the declaration or in every entry");
            if (h.validTargets && inst?.to !== undefined && !h.validTargets.includes(inst.to)) add("H011", w, `target \`${inst.to}\` is no argument a call of the Program reaches`);
          });
        }
      } catch (e) {
        add("U017", where, `\`each\` threw on the sample record: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  const stage = ui.stage;
  if (stage !== undefined) {
    if (!outputs.includes(stage.draw)) add("U014", "stage", `\`stage.draw\` ${JSON.stringify(stage.draw)} is no Draw output; outputs: ${outputs.join(", ")}`);
    if (stage.pointer !== undefined) {
      const port = inputs[stage.pointer];
      if (!port) add("U015", "stage.pointer", `${JSON.stringify(stage.pointer)} is no Event input`);
      else {
        const takes = seamFields(String(port.seam));
        if (!takes) add("U015", "stage.pointer", "not an Event input");
        else for (const p of seamProblems(POINTER_FIELDS, takes)) add("U016", "stage.pointer", p);
      }
    }
  }

  for (const [name, g] of Object.entries(ui.grips ?? {})) {
    const where = `grips.${name}`;
    /** @type {any} */
    const gr = g;
    if (!stage) add("U018", where, "a Grip needs a UI with a Draw stage");
    for (const k of Object.keys(gr)) if (!GRIP_KEYS.includes(k)) add("U018", where, `unknown key \`${k}\``);
    if (!GRIP_KINDS.includes(gr.kind)) add("U018", where, `unknown kind ${JSON.stringify(gr.kind)}`);
    if (gr.kind === "length" && typeof gr.axis !== "function") add("U018", where, "`axis` is missing for a length Grip");
    if ((gr.kind === "rotate" || gr.kind === "scale") && typeof gr.center !== "function") add("U018", where, `\`center\` is missing for a ${gr.kind} Grip`);
    if (typeof gr.at !== "function" || typeof gr.to !== "function") add("U018", where, "`at` and `to` are functions");
    if (gr.each !== undefined && typeof gr.each !== "string") add("U018", where, "`each` is a state list path (a string)");
    if (h.gripItem !== undefined && typeof gr.at === "function" && typeof gr.to === "function") {
      try {
        const p = gr.at(h.gripItem, {}, {});
        if (!(Array.isArray(p) && p.length === 2 && p.every((/** @type {any} */ n) => typeof n === "number"))) add("L003", where, "`at` does not give a point");
        const t = gr.to(h.gripItem, {}, {});
        if (typeof t !== "string" || !TARGET.test(t)) add("L003", where, `\`to\` gave ${JSON.stringify(t)}, not a target string`);
        else if (h.validTargets && !h.validTargets.includes(t)) add("H011", where, `target \`${t}\` is no argument a call of the Program reaches`);
      } catch (e) {
        add("L003", where, `a Grip lambda threw on the sample item: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  for (const [name, a] of Object.entries(ui.actions ?? {})) {
    const where = `actions.${name}`;
    /** @type {any} */
    const ac = a;
    for (const k of Object.keys(ac)) if (!ACTION_KEYS.includes(k)) add("U019", where, `unknown key \`${k}\``);
    if (!/^\.\/[^/]+\.js$/.test(String(ac.module))) add("U019", where, "`module` is not `./<file>.js`");
    if (!IDENT.test(String(ac.export))) add("U019", where, "`export` is not an identifier");
    if (!["file", "edits"].includes(ac.gives)) add("U019", where, "`gives` is file or edits");
  }

  const tileNames = Object.keys(ui.tiles ?? {});
  /** @type {(item: any, where: string) => void} */
  const walk = (item, where) => {
    if (item?.kind === "row" || item?.kind === "column") return (item.items ?? []).forEach((/** @type {any} */ x, /** @type {number} */ i) => walk(x, `${where}.items[${i}]`));
    if (item?.kind === "control" && !names.includes(item.control)) add("U020", where, `control \`${item.control}\` is not declared`);
    if (item?.kind === "action" && !(item.action in (ui.actions ?? {}))) add("U020", where, `action \`${item.action}\` is not declared`);
    if (item?.kind === "view") {
      if (!outputs.includes(item.draw)) add("U014", where, `view names no Draw output: ${JSON.stringify(item.draw)}`);
      if (item.pointer !== undefined && !inputs[item.pointer]) add("U015", where, `pointer ${JSON.stringify(item.pointer)} is no input`);
    }
  };
  for (const [name, t] of Object.entries(ui.tiles ?? {})) {
    /** @type {any} */
    const tile = t;
    if (!Array.isArray(tile.body)) add("U014", `tiles.${name}`, "a tile is { title, place, body: [component, …] }: `body` is missing");
    if (typeof tile.place !== "object" || tile.place === null || Object.keys(tile.place).length !== 1) add("U003", `tiles.${name}`, "`place` takes exactly one direction");
    (tile.body ?? []).forEach((/** @type {any} */ b, /** @type {number} */ i) => walk(b, `tiles.${name}.body[${i}]`));
    for (const [k, v] of Object.entries(tile.place ?? {})) {
      if (!DIRECTIONS.includes(k)) add("U003", `tiles.${name}.place`, `unknown placement \`${k}\``);
      else if (v === "pad") add("U003", `tiles.${name}.place`, "`pad` is now `controls`");
      else if (!tileNames.includes(String(v)) && !VIEWS.includes(String(v))) add("U003", `tiles.${name}.place`, `\`${v}\` is no view or tile`);
    }
  }
  return out;
}

/**
 * Checks a glue's text: the lines that wire page Controls (a leg's hand-in is text, not a runnable glue).
 * @param {string} text
 * @param {{ controls: string[] }} ui `controls` the names of the Controls that have an input
 * @returns {Problem[]}
 */
export function checkGlue(text, ui) {
  /** @type {Problem[]} */
  const out = [];
  const wired = new Set();
  for (const m of text.matchAll(/\.wire\(\s*page\.out\.(\w+)\s*,\s*(\w+)\.in\.(\w+)\s*\)/g)) {
    const [, c, , input] = m;
    wired.add(c);
    if (!ui.controls.includes(String(c))) out.push({ code: "S111", where: m[0], text: `\`${c}\` is no declared Control` });
    if (c !== input) out.push({ code: "S2xx", where: m[0], text: `Controls bind by name: \`${c}\` goes to an input of the same name, not \`${input}\`` });
  }
  for (const c of ui.controls) if (!wired.has(c)) out.push({ code: "S120", where: c, text: `Control \`${c}\` is never wired` });
  for (const bad of ["PAGE_CONTROLS", "DEFAULT_KEYS", "role:"]) if (text.includes(bad)) out.push({ code: "RETIRED", where: bad, text: `\`${bad}\` is not in the draft` });
  return out;
}
