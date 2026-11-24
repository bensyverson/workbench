// Reads each runtime lambda and lib/ helper from its source with kit/parse: the kernel subset (kit/parse's
// own P… and S1… codes), the free-name rule (S331, S332), what it reads of other parts (S203, S311, S312,
// S313), its context's members (D005), the GPU's limits (D007) and frame tags (S251). It records what each
// lambda reads, for the task's checks (G…).

import { parseLambda, checkSubset } from "../../../kit/parse/index.js";
import { didYouMean } from "../../../kit/lower/codes.js";
import { session } from "./session.js";
import { CELL_MEMBERS, CavePart } from "./stubs/cave.js";
import { OutHandle } from "./handles.js";
import { PIXEL_MEMBERS } from "./stubs/glow.js";
import { ACTOR_MEMBERS, WORLD_MEMBERS, INPUT_MEMBERS, SPAWN_MEMBERS, CONVERSIONS } from "./stubs/tiles.js";
import { isSignalReadable } from "./types.js";

/** @import { LambdaRec, Site } from "./session.js" */
/** @import { Part, Actor } from "./handles.js" */
/** @import { TilesPart } from "./stubs/tiles.js" */
/** @import { Node, Expression, Identifier, ArrowFunctionExpression } from "../../../kit/parse/ast.js" */

/** The kernel intrinsics, always in scope in a runtime lambda or lib/ helper. */
export const INTRINSICS = new Set("abs sign floor ceil fract mod min max clamp mix step smoothstep sqrt pow exp log sin cos tan atan length distance dot normalize vec2 vec3 vec4 PI".split(" "));
const LITERAL_NAMES = new Set(["undefined", "NaN", "Infinity"]);
const COMPARE = new Set(["==", "===", "!=", "!=="]);

/**
 * What a top-level name in program.js is.
 * @typedef {{ kind: "part", part: Part } | { kind: "actor", actor: Actor } | { kind: "params" } | { kind: "program" }
 *   | { kind: "const", fn: boolean } | { kind: "import", from: string, exported: string }} Binding
 */

/**
 * What one lambda reads, for the task's checks.
 * @typedef {object} Reads
 * @property {Array<{ part: Part, name: string }>} outs  other parts' outputs it reads
 * @property {Set<string>} helpers  lib/ helpers it calls
 * @property {Set<string>} params  parameters it reads as `$.name`
 * @property {boolean} convertsCell  it calls tile() on a position of a cave's grid
 */

/** @param {string} tag */
const tagType = (tag) => (tag === "px" ? "vec2@px" : tag === "cell" ? "vec2i@cell" : `@${tag}`);

/**
 * The line in `file` where `src` starts, searching from `fromLine`; `fromLine` if it cannot be found.
 * @param {string} src @param {string} file @param {number} fromLine
 */
function locate(src, file, fromLine) {
  const text = session.sources[file] ?? "";
  const lines = text.split("\n");
  const offset = lines.slice(0, fromLine - 1).reduce((n, l) => n + l.length + 1, 0);
  let at = text.indexOf(src, offset);
  if (at < 0) at = text.indexOf(src);
  return at < 0 ? fromLine : text.slice(0, at).split("\n").length;
}

/**
 * Every node under `root`, with its parent.
 * @param {Node} root
 * @returns {Map<Node, Node | null>}
 */
function parents(root) {
  /** @type {Map<Node, Node | null>} */
  const m = new Map();
  /** @param {any} n @param {Node | null} p */
  const go = (n, p) => {
    if (!n || typeof n !== "object" || typeof n.type !== "string" || m.has(n)) return;
    m.set(n, p);
    for (const [k, v] of Object.entries(n)) {
      if (k === "loc" || k === "range") continue;
      if (Array.isArray(v)) for (const c of v) go(c, n);
      else go(v, n);
    }
  };
  go(root, null);
  return m;
}

/** @param {any} p @param {Set<string>} into */
function patternNames(p, into) {
  if (!p) return;
  if (p.type === "Identifier") into.add(p.name);
  else if (p.type === "ObjectPattern") for (const q of p.properties) patternNames(q.value, into);
  else if (p.type === "ArrayPattern") for (const q of p.elements) patternNames(q, into);
  else if (p.type === "AssignmentPattern") patternNames(p.left, into);
}

/**
 * The context one analysis runs in.
 * @typedef {object} Scope
 * @property {string} file
 * @property {"lambda" | "lib"} mode
 * @property {Map<string, Binding>} bindings  program.js's top-level names (empty for a lib helper)
 * @property {Set<string>} libNames  helpers a lib file may call (its own and those it imports)
 */

/**
 * Analyzes one runtime lambda.
 * @param {LambdaRec} rec @param {Map<string, Binding>} bindings
 * @returns {Reads}
 */
export function analyzeLambda(rec, bindings) {
  return analyze(rec.fn, rec.site, { file: rec.site.file, mode: "lambda", bindings, libNames: new Set() }, rec);
}

/**
 * Analyzes one lib/ helper.
 * @param {Function} fn @param {string} file @param {Set<string>} libNames
 */
export function analyzeHelper(fn, file, libNames) {
  analyze(fn, { file, line: 1 }, { file, mode: "lib", bindings: new Map(), libNames }, null);
}

/**
 * @param {Function} fn @param {Site} site @param {Scope} scope @param {LambdaRec | null} rec
 * @returns {Reads}
 */
function analyze(fn, site, scope, rec) {
  /** @type {Reads} */
  const reads = { outs: [], helpers: new Set(), params: new Set(), convertsCell: false };
  const src = String(fn);
  const base = locate(src, scope.file, site.line);
  /** @param {{ loc: { start: { line: number } } }} n @returns {Site} */
  const at = (n) => ({ file: scope.file, line: base + n.loc.start.line - 1 });
  const parsed = parseLambda(src);
  if (!parsed.ok) {
    for (const d of parsed.diagnostics) session.add(d.code, at(d), d.message, d.tip, d.severity);
    return reads;
  }
  for (const d of checkSubset(parsed.ast, src)) session.add(d.code, at(d), d.message, d.tip, d.severity);

  const ast = parsed.ast;
  const up = parents(ast);
  /** @type {Set<string>} */
  const locals = new Set();
  /** @type {Map<string, Expression>} */
  const inits = new Map();
  for (const n of up.keys()) {
    const a = /** @type {any} */ (n);
    if (a.type === "ArrowFunctionExpression") for (const p of a.params) patternNames(p, locals);
    if (a.type === "VariableDeclarator") { patternNames(a.id, locals); if (a.id.type === "Identifier" && a.init) inits.set(a.id.name, a.init); }
  }
  /** @type {Map<string, string>} parameter name → role */
  const roles = new Map();
  if (rec) ast.params.forEach((p, i) => { if (p.type === "Identifier" && rec.roles[i]) roles.set(p.name, rec.roles[i]); });

  const part = rec ? rec.part ?? rec.actor?.part ?? null : null;
  const dialect = part?.dialect ?? (rec?.actor ? "tiles" : null);
  const gpu = part?.target === "gpu";
  const tiles = /** @type {TilesPart | null} */ (dialect === "tiles" ? part : null);
  const owner = rec?.actor?.label ?? part?.label ?? "this lambda";

  /**
   * The member names read off an identifier (`a.b.c` → ["b", "c"]), and the outermost node of the chain.
   * @param {Node} id
   */
  const chain = (id) => {
    /** @type {string[]} */
    const names = [];
    let cur = id;
    let p = up.get(cur);
    while (p && p.type === "MemberExpression" && p.object === cur && !p.computed && p.property.type === "Identifier") {
      names.push(p.property.name);
      cur = p;
      p = up.get(cur);
    }
    return { names, top: cur };
  };

  /** The frame tag of an expression, or null (no tag, or not known). @param {any} n @param {number} [depth] @returns {string | null} */
  const tagOf = (n, depth = 0) => {
    if (!n || depth > 8) return null;
    if (n.type === "ConditionalExpression") { const a = tagOf(n.consequent, depth + 1); return a && a === tagOf(n.alternate, depth + 1) ? a : null; }
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && dialect === "tiles" && Object.hasOwn(CONVERSIONS, n.callee.name) && isConversion(n.callee.name)) return CONVERSIONS[/** @type {"tile" | "cell"} */ (n.callee.name)];
    let root = n;
    /** @type {string[]} */
    const names = [];
    while (root.type === "MemberExpression" && !root.computed && root.property.type === "Identifier") { names.unshift(root.property.name); root = root.object; }
    if (root.type !== "Identifier") return null;
    const name = root.name;
    if (roles.has(name)) return roleTag(/** @type {string} */ (roles.get(name)), names);
    if (locals.has(name)) return names.length === 0 ? tagOf(inits.get(name), depth + 1) : null;
    const b = scope.bindings.get(name);
    if (b?.kind === "part" && names[0] === "out" && names.length === 2) return b.part.outputs().get(names[1])?.tag ?? null;
    return null;
  };

  /**
   * Whether an expression is a position on a cave's grid: a cave output tagged @cell, a spawn point of a
   * cave's `spawns`, or a local holding one. A conversion's result (`cell(px)`) is not.
   * @param {any} n @param {number} [depth]
   * @returns {boolean}
   */
  const fromCave = (n, depth = 0) => {
    if (!n || depth > 8) return false;
    if (n.type === "ConditionalExpression") return fromCave(n.consequent, depth + 1) && fromCave(n.alternate, depth + 1);
    let root = n;
    /** @type {string[]} */
    const names = [];
    while (root.type === "MemberExpression" && !root.computed && root.property.type === "Identifier") { names.unshift(root.property.name); root = root.object; }
    if (root.type !== "Identifier") return false;
    const name = root.name;
    if (roles.has(name)) {
      if (roles.get(name) !== "spawn" || names.length !== 1 || names[0] !== "at" || !rec?.actor) return false;
      return !!tiles?.spawns.some((s) => s.actor === rec.actor && s.from instanceof OutHandle && s.from.part instanceof CavePart);
    }
    if (locals.has(name)) return names.length === 0 && fromCave(inits.get(name), depth + 1);
    const b = scope.bindings.get(name);
    return b?.kind === "part" && b.part instanceof CavePart && names[0] === "out" && names.length === 2 && b.part.outputs().get(names[1])?.tag === "cell";
  };

  /** @param {string} name whether a free name is the tiles conversion of that name */
  const isConversion = (name) => !locals.has(name) && scope.bindings.get(name)?.kind === "import" && /** @type {any} */ (scope.bindings.get(name)).from === "tiles";

  /** @param {string} role @param {string[]} names @returns {string | null} */
  const roleTag = (role, names) => {
    const [a, b] = names;
    if (role === "cell" && names.length === 1 && a === "cell") return "cell";
    if (role === "pixel" && names.length === 1 && (a === "xy" || a === "size")) return "px";
    if (role === "spawn" && names.length === 1 && a === "at") return "cell";
    if (role === "self" && names.length === 1) return rec?.actor?.fields.get(a)?.tag ?? null;
    if (role === "world" && names.length === 2 && a === "player") return tiles?.player?.actor.fields.get(b)?.tag ?? null;
    if (role === "world" && names.length === 2 && a === "state") return tiles?.state.get(b)?.tag ?? null;
    return null;
  };

  /** @param {{ range: [number, number] }} n */
  const text = (n) => src.slice(n.range[0], n.range[1]);

  /**
   * S251 when a tagged value goes unchanged where another frame is expected.
   * @param {string | null} expected @param {any} value @param {string} what  the slot, for the message
   */
  const frame = (expected, value, what) => {
    const got = tagOf(value);
    if (!expected || !got || got === expected) return;
    const conv = dialect === "tiles" ? Object.entries(CONVERSIONS).find(([, to]) => to === expected)?.[0] : null;
    const fix = conv ? `convert it with the tiles conversion: ${conv}(${text(value)})` : `${dialect ?? "this dialect"} has no conversion between frames: convert in the tiles part (tile() or cell()) and export the converted value`;
    session.add("S251", at(value), `${what} is ${tagType(expected)}, but ${text(value)} is ${tagType(got)}.`, fix);
  };

  // Free names, members, and what crosses.
  for (const n of up.keys()) {
    if (n.type !== "Identifier") continue;
    const p = /** @type {any} */ (up.get(n));
    if (p && p.type === "MemberExpression" && p.property === n && !p.computed) continue;
    if (p && p.type === "Property" && p.key === n && !p.computed && !p.shorthand) continue;
    const name = n.name;
    const { names, top } = chain(n);
    if (roles.has(name)) { members(/** @type {string} */ (roles.get(name)), names, n); continue; }
    if (locals.has(name) || LITERAL_NAMES.has(name)) continue;
    if (INTRINSICS.has(name)) continue;
    if (scope.mode === "lib") {
      if (scope.libNames.has(name)) continue;
      session.add("S331", at(n), name === "Math" ? "Math is not in the kernel subset." : `a lib/ helper sees only its arguments, kernel intrinsics and other lib/ helpers; '${name}' is none of these.`, name === "Math" ? "use the intrinsics: sin(x), floor(x), … not Math.sin(x)" : `pass ${name} in as an argument`);
      continue;
    }
    resolve(n, name, names, top);
  }

  /** @param {Identifier} n @param {string} name @param {string[]} names @param {Node} top */
  function resolve(n, name, names, top) {
    const b = scope.bindings.get(name);
    const isCall = up.get(top)?.type === "CallExpression" && /** @type {any} */ (up.get(top)).callee === top;
    if (!b) {
      const msg = name === "Math" ? "Math is not in the kernel subset." : `${owner}'s lambda reads '${name}', which is not a parameter, a local, an intrinsic, a lib/ helper, a part, or a top-level constant.${didYouMean(name, [...INTRINSICS, ...scope.bindings.keys()])}`;
      const fix = name === "Math" ? "use the intrinsics: sin(x), floor(x), … not Math.sin(x)" : "a name made inside build-time code is not visible while the program runs: move it to a top-level const, a parameter, or the part's state";
      session.add("S331", at(n), msg, fix);
      return;
    }
    switch (b.kind) {
      case "import":
        if (b.from.startsWith("./lib/") || b.from.startsWith("lib/")) { if (isCall) reads.helpers.add(name); return; }
        if (b.from === "tiles" && Object.hasOwn(CONVERSIONS, b.exported)) {
          if (dialect !== "tiles") session.add("S332", at(n), `${b.exported}() belongs to tiles; ${owner} is a ${dialect} part.`, `convert in the tiles part and export the result: .export("<name>", "vec2@px", w => ${b.exported}(…))`);
          return;
        }
        session.add("S331", at(n), `${name} (from "${b.from}") is build-time API; a runtime lambda cannot call it.`, "use it at the top level of the program, outside any lambda");
        return;
      case "params": {
        const param = names[0];
        if (!param) { session.add("S331", at(n), `read a parameter as ${name}.<name>, not the parameters object itself.`, `${name}.<name>`); return; }
        const specs = session.params?.specs ?? {};
        if (!Object.hasOwn(specs, param)) session.add("C004", at(n), `there is no parameter '${param}'.${didYouMean(param, Object.keys(specs))}`, `declare it in params({ … }), or use one of ${Object.keys(specs).join(", ")}`);
        else reads.params.add(param);
        return;
      }
      case "part": readPart(n, b.part, names); return;
      case "actor":
        if (dialect === "tiles" && (!b.actor.part || b.actor.part === part)) return;
        session.add("S312", at(n), `${owner} reads ${name}, an actor kind inside part '${b.actor.part?.label ?? "?"}'; parts meet only through outputs.`, `export what you need from ${b.actor.part?.label ?? "the tiles part"} (.export(name, type, w => …)) and read it as ${b.actor.part?.label ?? "game"}.out.<name>`);
        return;
      case "program":
        session.add("S331", at(n), `${name} is the program; a runtime lambda cannot read it.`, "read a part's output instead");
        return;
      case "const":
        if (b.fn || isCall) session.add("S331", at(n), `${name} is a function in program.js; a runtime lambda can call only intrinsics, lib/ helpers and its dialect's functions.`, `move ${name} to a lib/ file as an exported arrow function, and import it`);
        return;
    }
  }

  /** @param {Identifier} n @param {Part} producer @param {string[]} names */
  function readPart(n, producer, names) {
    const label = producer.label;
    if (names[0] !== "out") {
      const what = names[0] ? `${label}.${names[0]}` : label;
      const fix = !names[0] ? `read one of ${label}'s outputs, ${label}.out.<name>` : producer.outputs().has(names[0]) ? `read the output: ${label}.out.${names[0]}` : producer.exportFix(names[0]);
      session.add("S312", at(n), `${owner} reads ${what}, which is inside part '${label}'; parts meet only through outputs.`, fix);
      return;
    }
    const outName = names[1] === "events" && producer.dialect === "tiles" ? `events.${names[2] ?? ""}` : names[1];
    if (!outName) { session.add("S311", at(n), `read one output, ${label}.out.<name>, not the outputs object.`, `${label}.out.<name>`); return; }
    const outputs = producer.outputs();
    const t = outputs.get(outName);
    if (!t) {
      session.add("S311", at(n), `${label} has no output '${outName}'; its outputs are ${[...outputs.keys()].join(", ")}.${didYouMean(outName, [...outputs.keys()])}`, producer.dialect === "tiles" ? `use a declared output, or add it: .export("${outName}", "<type>", w => …) on ${label}` : `use one of ${[...outputs.keys()].join(", ")}`);
      return;
    }
    if (producer === part) {
      session.add("S313", at(n), `${owner} reads ${label}.out.${outName}, its own output (one step stale).`, producer.dialect === "tiles" ? "read your state directly, such as w.state.<name> or w.player.pos" : "read the value directly");
      return;
    }
    if (gpu && !isSignalReadable(t)) {
      session.add("S203", at(n), `${label}.out.${outName} is ${t.text}; a GPU kernel reads only scalar, vector and enum signals.`, `export a number from ${label} instead (a count, a nearest position, a timer)`);
      return;
    }
    reads.outs.push({ part: producer, name: outName });
  }

  /** D005 for an unknown member of a context parameter. @param {string} role @param {string[]} names @param {Node} n */
  function members(role, names, n) {
    if (!names.length) return;
    const [a, b] = names;
    /** @param {string} what @param {string} m @param {Iterable<string>} known */
    const bad = (what, m, known) => {
      const list = [...known];
      session.add("D005", at(n), `${what} has no member '${m}'; its members are ${list.join(", ")}.${didYouMean(m, list)}`, "use a member the reference lists");
    };
    const actorMembers = (/** @type {Actor | null | undefined} */ act) => [...ACTOR_MEMBERS, ...(act ? [...act.fields.keys()].filter((k) => k !== "pos") : [])];
    if (role === "cell" && !CELL_MEMBERS.includes(a)) bad("the cell context c", a, CELL_MEMBERS);
    if (role === "pixel" && !PIXEL_MEMBERS.includes(a)) bad("the pixel context p", a, PIXEL_MEMBERS);
    if (role === "spawn" && !SPAWN_MEMBERS.includes(a)) bad("a spawn point", a, SPAWN_MEMBERS);
    if (role === "self" && !actorMembers(rec?.actor).includes(a)) bad(`actor ${rec?.actor?.label}`, a, actorMembers(rec?.actor));
    if (role === "world") {
      if (!WORLD_MEMBERS.includes(a)) bad("the world w", a, WORLD_MEMBERS);
      else if (b !== undefined && a === "input" && !INPUT_MEMBERS.includes(b)) bad("w.input", b, INPUT_MEMBERS);
      else if (b !== undefined && a === "state" && tiles && !tiles.state.has(b)) bad("w.state", b, tiles.state.keys());
      else if (b !== undefined && a === "player" && tiles?.player && !actorMembers(tiles.player.actor).includes(b)) bad(`the player (${tiles.player.actor.label})`, b, actorMembers(tiles.player.actor));
    }
  }

  // Frames, the GPU's limits, conversions and events.
  for (const n of up.keys()) {
    const a = /** @type {any} */ (n);
    if (a.type === "ForOfStatement" && gpu) session.add("D007", at(a), "for…of is not available on the GPU.", "loop with a counter: for (let i = 0; i < n; i++)");
    if (a.type === "BinaryExpression" && COMPARE.has(a.operator)) {
      const [l, r] = [tagOf(a.left), tagOf(a.right)];
      if (l && r && l !== r) frame(l, a.right, text(a.left));
    }
    if (a.type === "CallExpression" && a.callee.type === "Identifier") {
      const callee = a.callee.name;
      if (callee === "distance" && !locals.has(callee) && a.arguments.length === 2) {
        const [l, r] = [tagOf(a.arguments[0]), tagOf(a.arguments[1])];
        if (l && r && l !== r) frame(l, a.arguments[1], `distance()'s first argument ${text(a.arguments[0])}`);
      }
      if (dialect === "tiles" && isConversion(callee) && a.arguments[0]) {
        const want = callee === "tile" ? "cell" : "px";
        frame(want, a.arguments[0], `${callee}()'s argument`);
        if (callee === "tile" && tagOf(a.arguments[0]) === "cell" && fromCave(a.arguments[0])) reads.convertsCell = true;
      }
    }
    if (a.type === "CallExpression" && a.callee.type === "MemberExpression" && a.callee.object.type === "Identifier" && roles.get(a.callee.object.name) === "world" && a.callee.property.name === "emit" && tiles) {
      const e = a.arguments[0];
      if (e?.type === "Literal" && typeof e.value === "string" && !tiles.events.has(e.value)) session.add("D005", at(a), `w.emit('${e.value}'): ${tiles.label} declares no event '${e.value}'.`, `declare it: .event("${e.value}", { … })`);
    }
    if (a.type === "AssignmentExpression" && a.operator === "=") {
      const t = tagOf(a.left);
      if (t) frame(t, a.right, text(a.left));
    }
  }

  // What the lambda hands back: an actor's starting fields, or an exported value.
  if (rec && (rec.slot === "tiles.spawn.init" || rec.slot === "tiles.export")) {
    for (const ret of returns(ast)) {
      if (rec.slot === "tiles.export") {
        const tag = /@(\w+)$/.exec(rec.exportType ?? "")?.[1] ?? null;
        frame(tag, ret, `the output (${rec.exportType})`);
      } else if (ret.type === "ObjectExpression" && rec.actor) {
        for (const prop of ret.properties) {
          if (prop.type !== "Property" || prop.computed) continue;
          const key = prop.key.type === "Identifier" ? prop.key.name : String(/** @type {any} */ (prop.key).value);
          const field = rec.actor.fields.get(key);
          if (key === "id") session.add("D005", at(prop), "id is set from the spawn point's id; init may not assign it.", "remove id from the object");
          else if (!field) session.add("D005", at(prop), `${rec.actor.label} has no field '${key}'; its fields are ${[...rec.actor.fields.keys()].join(", ")}.${didYouMean(key, [...rec.actor.fields.keys()])}`, `declare it with ${rec.actor.label}.state({ ${key}: [type, initial] })`);
          else frame(field.tag ?? null, prop.value, `${rec.actor.label}.${key}`);
        }
      }
    }
  }
  return reads;
}

/** The expressions a lambda returns (its body, if concise). @param {ArrowFunctionExpression} ast @returns {any[]} */
function returns(ast) {
  if (ast.body.type !== "BlockStatement") return [ast.body];
  /** @type {any[]} */
  const out = [];
  /** @param {any} n */
  const go = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "ArrowFunctionExpression") return;
    if (n.type === "ReturnStatement" && n.argument) out.push(n.argument);
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") (Array.isArray(v) ? v.forEach(go) : go(v));
  };
  go(ast.body);
  return out;
}
