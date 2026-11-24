// The stand-in for the `tiles` dialect (docs/tiles.md): tiles(), actor(), the tile() / cell() conversions
// and the grid() / points() literals.

import { session, callSite } from "../session.js";
import { Part, Actor, OutHandle, unwrap, isPoison } from "../handles.js";
import { parseDeclaredType, DECLARED_TYPES } from "../types.js";
import * as arg from "../args.js";

/** @import { MethodSpec, Ctx } from "../handles.js" */
/** @import { SeamType } from "../types.js" */
/** @import { Site } from "../session.js" */

export const CELL_PX = 8;
export const ACTOR_MEMBERS = ["id", "pos", "remove"];
export const WORLD_MEMBERS = ["dt", "time", "input", "player", "state", "move", "tileAt", "all", "touching", "emit", "end"];
export const INPUT_MEMBERS = ["dir", "fire"];
export const SPAWN_MEMBERS = ["id", "kind", "at"];
/** The conversions, by name: the frame each returns. */
export const CONVERSIONS = Object.freeze({ tile: "px", cell: "cell" });

/** A grid written as rows of characters, `grid([...], legend)`. */
export class GridLiteral {
  /** @param {[number, number]} shape @param {string[]} values */
  constructor(shape, values) { this.shape = shape; this.values = values; }
}

/** Spawn points written by hand, `points(kind, cells)`. */
export class PointsLiteral {
  /** @param {string} kind @param {number} count */
  constructor(kind, count) { this.kind = kind; this.count = count; }
}

/**
 * Reads a `{ name: [type, initial] }` object into typed fields.
 * @param {unknown} fields @param {Ctx} ctx @param {Map<string, SeamType>} into
 */
function readState(fields, ctx, into) {
  if (!arg.obj(fields, ctx, "the fields")) return;
  for (const [k, v] of Object.entries(fields)) {
    const t = Array.isArray(v) && v.length === 2 ? parseDeclaredType(v[0]) : null;
    if (!t) { session.add("D002", ctx.site, `${ctx.owner.label}.${ctx.method}(): field '${k}' must be [type, initial], with type ${DECLARED_TYPES}.`, `${k}: ["f32", 0]`); continue; }
    if (into.has(k)) session.add("D004", ctx.site, `field '${k}' is declared twice.`, "declare each field once");
    into.set(k, t);
  }
}

export class TilesPart extends Part {
  /** @param {string} name @param {Site} site */
  constructor(name, site) {
    super("tiles", name, site, { clock: "tick(60)", target: "cpu" });
    /** @type {[number, number] | null} */
    this.screen = null;
    /** @type {Set<string>} */
    this.tileKinds = new Set();
    /** @type {{ source: OutHandle | GridLiteral, values: Record<string, unknown>, site: Site } | null} */
    this.map = null;
    /** @type {Array<{ actor: Actor, from: OutHandle | PointsLiteral, kind: string, site: Site }>} */
    this.spawns = [];
    /** @type {{ actor: Actor, site: Site } | null} */
    this.player = null;
    /** @type {Map<string, SeamType>} */
    this.state = new Map();
    /** @type {Map<string, unknown>} */
    this.events = new Map();
    /** @type {Map<string, SeamType>} */
    this.exports = new Map();
  }

  /** @returns {Record<string, MethodSpec>} */
  methods() {
    return {
      ...super.methods(),
      screen: { once: true, fn: ([w, h], ctx) => {
        if (!arg.num(w, ctx, "width", { min: 64, max: 1024 }) || !arg.num(h, ctx, "height", { min: 64, max: 1024 })) return;
        const [W, H] = [/** @type {number} */ (w), /** @type {number} */ (h)];
        if (W % CELL_PX || H % CELL_PX) { session.add("D002", ctx.site, `${this.label}.screen(${W}, ${H}): each side must be a multiple of 8 (one cell is 8 px).`, `.screen(${Math.round(W / 8) * 8}, ${Math.round(H / 8) * 8})`); return; }
        this.screen = [W, H];
      } },
      tiles: { once: true, fn: ([kinds], ctx) => {
        if (!arg.obj(kinds, ctx, "the tile kinds")) return;
        for (const [k, v] of Object.entries(kinds)) {
          if (!arg.obj(v, ctx, `tile '${k}'`) || !arg.keys(v, ctx, ["color", "solid"])) continue;
          arg.str(v.color, ctx, `tile '${k}'.color`);
          if (v.solid !== undefined && typeof v.solid !== "boolean") session.add("D002", ctx.site, `tile '${k}'.solid must be true or false.`, "solid: true");
          this.tileKinds.add(k);
        }
      } },
      map: { once: true, fn: ([grid, values], ctx) => {
        const source = grid instanceof GridLiteral ? grid : arg.connect(grid, ctx, "the grid", "Grid@cell");
        if (!source || !arg.obj(values, ctx, "the value mapping")) return;
        if (source instanceof OutHandle) this.connections.push({ slot: "map", handle: source, site: ctx.site });
        this.map = { source, values, site: ctx.site };
      } },
      spawn: { fn: ([kind, from, opts], ctx) => {
        const a = unwrap(kind);
        if (!(a instanceof Actor)) { if (!isPoison(kind)) session.add("D002", ctx.site, `${this.label}.spawn(): the first argument must be an actor kind made with actor(name); got ${arg.show(kind)}.`, 'const Bat = actor("Bat"); … .spawn(Bat, …)'); return; }
        const source = from instanceof PointsLiteral ? from : arg.connect(from, ctx, "the spawn points", "Spawn[]");
        if (!source || !arg.obj(opts, ctx, "the options") || !arg.keys(opts, ctx, ["kind", "init"])) return;
        if (!arg.str(opts.kind, ctx, "kind")) return;
        if (source instanceof OutHandle) this.connections.push({ slot: "spawn", handle: source, site: ctx.site });
        this.spawns.push({ actor: a, from: source, kind: /** @type {string} */ (opts.kind), site: ctx.site });
        a.part ??= this;
        if (opts.init !== undefined && arg.fn(opts.init, ctx, "init", "s => ({ pos: … })")) this.lambda(opts.init, ctx, "tiles.spawn.init", ["spawn"], { actor: a });
      } },
      player: { once: true, fn: ([kind], ctx) => {
        const a = unwrap(kind);
        if (a instanceof Actor) this.player = { actor: a, site: ctx.site };
        else if (!isPoison(kind)) session.add("D002", ctx.site, `${this.label}.player() takes an actor kind; got ${arg.show(kind)}.`, ".player(Hero)");
      } },
      state: { once: true, fn: ([fields], ctx) => readState(fields, ctx, this.state) },
      event: { perKey: true, fn: ([name, fields], ctx) => {
        if (arg.str(name, ctx, "the event name", /^[A-Za-z_]\w*$/) && arg.obj(fields, ctx, "the event's fields")) {
          for (const [k, t] of Object.entries(fields)) if (!parseDeclaredType(t)) session.add("D002", ctx.site, `event field '${k}' has type ${arg.show(t)}; use ${DECLARED_TYPES}.`, `${k}: "int"`);
          this.events.set(/** @type {string} */ (name), fields);
        }
      } },
      update: { once: true, fn: ([f], ctx) => { if (arg.fn(f, ctx, "the world update", "w => { … }")) this.lambda(f, ctx, "tiles.update", ["world"]); } },
      export: { perKey: true, fn: ([name, type, read], ctx) => {
        if (!arg.str(name, ctx, "the output name", /^[A-Za-z_]\w*$/)) return;
        const n = /** @type {string} */ (name);
        if (n === "image" || n === "events") { session.add("D002", ctx.site, `'${n}' is a built-in output of every tiles part.`, "choose another name"); return; }
        const t = parseDeclaredType(type);
        if (!t) { session.add("D002", ctx.site, `${this.label}.export('${n}', …): the type must be ${DECLARED_TYPES}; got ${arg.show(type)}.`, `.export("${n}", "f32", w => …)`); return; }
        this.exports.set(n, t);
        if (arg.fn(read, ctx, "read", "w => value")) this.lambda(read, ctx, "tiles.export", ["world"], { exportType: t.text });
      } },
    };
  }

  /** @returns {Map<string, SeamType>} */
  outputs() {
    /** @type {Map<string, SeamType>} */
    const m = new Map([["image", { text: "Image@px", kind: "image", tag: "px" }]]);
    for (const e of this.events.keys()) m.set(`events.${e}`, { text: "Event<…>", kind: "event" });
    for (const [k, t] of this.exports) m.set(k, t);
    return m;
  }

  internals() { return [...this.state.keys(), ...this.events.keys(), "player", "actors", "world", "state", "map", "screen"].filter((k) => !this.exports.has(k)); }

  /** @param {string} k */
  exportFix(k) {
    const t = this.state.get(k)?.text ?? (k === "player" ? "vec2@px" : "<type>");
    const read = this.state.has(k) ? `w.state.${k}` : k === "player" ? "w.player.pos" : "…";
    return `export it from ${this.label}: .export("${k}", "${t}", w => ${read}), then read ${this.label}.out.${k}`;
  }

  finalize() {
    for (const m of ["screen", "tiles", "map", "player", "update"]) {
      if (!this.called(m)) session.add("D003", this.site, `tiles '${this.name}' has no .${m}(); it is required.`, `add .${m}(…) (see tiles.md)`);
    }
    this.checkMap();
    let count = 0;
    let unknown = false;
    for (const s of this.spawns) {
      const n = this.spawnCount(s);
      if (s.actor === this.player?.actor) { count += n; unknown ||= n === 0; }
    }
    if (this.player && count !== 1 && !unknown) session.add("D006", this.player.site, `${this.player.actor.label} is spawned ${count} times; the player must be spawned exactly once.`, "spawn the player from a kind with count 1");
  }

  /** How many actors one .spawn() makes, or 0 when unknown. @param {TilesPart["spawns"][number]} s */
  spawnCount(s) {
    if (s.from instanceof PointsLiteral) {
      if (s.from.kind !== s.kind) { session.add("S204", s.site, `these points are of kind '${s.from.kind}'; '${s.kind}' is not one.`, `kind: "${s.from.kind}"`); return 0; }
      return s.from.count;
    }
    const t = s.from.type;
    if (!t) return 0;
    if (t.kind !== "array" || !t.kinds) { session.add("S203", s.site, `.spawn() takes Spawn[]; got ${t.text} (${s.from.text}).`, `use a cave's spawns: ${s.from.part.label}.out.spawns`); return 0; }
    if (!t.kinds.has(s.kind)) { session.add("S204", s.site, `${s.from.part.label} declares spawn kinds ${[...t.kinds.keys()].join(" | ") || "(none)"}; '${s.kind}' is not one.`, `kind: one of ${[...t.kinds.keys()].map((k) => `"${k}"`).join(", ")}`); return 0; }
    return t.kinds.get(s.kind) ?? 0;
  }

  checkMap() {
    if (!this.map) return;
    const { source, values, site } = this.map;
    /** @type {[number, number] | undefined} */
    let shape;
    /** @type {string[]} */
    let gridValues;
    let label;
    if (source instanceof GridLiteral) { shape = source.shape; gridValues = source.values; label = "the grid"; }
    else {
      const t = source.type;
      if (!t) return;
      if (t.kind !== "grid") { session.add("S203", site, `.map() takes Grid@cell; got ${t.text} (${source.text}).`, `use a grid output such as ${source.part.label}.out.cells`); return; }
      shape = t.shape;
      gridValues = t.values ?? [];
      label = `${source.part.label} '${source.part.name}'`;
    }
    if (shape && this.screen) {
      const [sc, sr] = [this.screen[0] / CELL_PX, this.screen[1] / CELL_PX];
      if (shape[0] !== sc || shape[1] !== sr) session.add("S201", site, `${label} is ${shape[0]}×${shape[1]} cells; the screen holds ${sc}×${sr} tiles (${this.screen[0]}×${this.screen[1]} px at 8 px).`, `change one side: .size(${sc}, ${sr}) on ${label}, or .screen(${shape[0] * 8}, ${shape[1] * 8}) on ${this.label}`);
    }
    for (const v of gridValues) if (!Object.hasOwn(values, v)) session.add("S202", site, `${label} has values ${gridValues.join(" | ")}; '${v}' has no tile.`, `map it: { ${gridValues.map((g) => `${g}: "<tile>"`).join(", ")} }`);
    for (const [k, tileName] of Object.entries(values)) {
      if (!gridValues.includes(k)) session.add("S202", site, `${label} has no value '${k}'; its values are ${gridValues.join(" | ")}.`, `remove '${k}' from the mapping`);
      else if (typeof tileName !== "string" || !this.tileKinds.has(tileName)) session.add("S202", site, `'${k}' maps to ${arg.show(tileName)}, which is not a tile kind; the kinds are ${[...this.tileKinds].join(", ")}.`, "map each value to a kind declared in .tiles({ … })");
    }
  }
}

export class TilesActor extends Actor {
  /** @param {string} name @param {Site} site */
  constructor(name, site) {
    super(name, site);
    this.fields.set("pos", { text: "vec2@px", kind: "vector", tag: "px", numeric: true });
  }

  /** @returns {Record<string, MethodSpec>} */
  methods() {
    return {
      look: { once: true, fn: ([o], ctx) => { if (arg.obj(o, ctx, "the look") && arg.keys(o, ctx, ["color", "glyph"])) arg.str(o.color, ctx, "color"); } },
      state: { once: true, fn: ([fields], ctx) => readState(fields, ctx, this.fields) },
      update: { once: true, fn: ([f], ctx) => {
        if (arg.fn(f, ctx, "the actor update", "(self, w) => { … }")) session.lambdas.push({ fn: /** @type {Function} */ (f), site: ctx.site, part: null, actor: this, slot: "actor.update", roles: ["self", "world"] });
      } },
    };
  }
}

/** A new tiles part. @param {unknown} name */
export function tiles(name) {
  const site = callSite();
  if (typeof name !== "string") session.add("D002", site, "tiles(name) takes a string name.", 'tiles("game")');
  return new TilesPart(typeof name === "string" ? name : "tiles", site).proxy();
}

/** A new actor kind. @param {unknown} name */
export function actor(name) {
  const site = callSite();
  if (typeof name !== "string") session.add("D002", site, "actor(name) takes a string name.", 'actor("Bat")');
  return new TilesActor(typeof name === "string" ? name : "actor", site).proxy();
}

/**
 * The conversions at build time, on plain values; inside a lambda the checker reads them from source.
 * @param {"tile" | "cell"} which @param {unknown} v
 */
function convert(which, v) {
  const h = unwrap(v);
  if (h instanceof OutHandle) { h.readAtBuild(`passed to ${which}()`); return [0, 0]; }
  if (!Array.isArray(v) || v.length !== 2) { session.add("D002", callSite(), `${which}() takes a vector [x, y]; got ${arg.show(v)}.`, `${which}([2, 3])`); return [0, 0]; }
  return which === "tile" ? v.map((x) => x * CELL_PX + CELL_PX / 2) : v.map((x) => Math.floor(x / CELL_PX));
}

/** A cell's center in px. @param {unknown} c */
export const tile = (c) => convert("tile", c);
/** The cell holding a pixel. @param {unknown} p */
export const cell = (p) => convert("cell", p);

/** A grid literal. @param {unknown} rows @param {unknown} legend */
export function grid(rows, legend) {
  const site = callSite();
  if (!Array.isArray(rows) || !rows.length || !rows.every((r) => typeof r === "string" && r.length === rows[0].length) || typeof legend !== "object" || legend === null) {
    session.add("D002", site, "grid(rows, legend) takes rows of equal length and a legend { char: value }.", 'grid(["###", "#.#"], { "#": "rock", ".": "open" })');
    return new GridLiteral([0, 0], []);
  }
  const lg = /** @type {Record<string, unknown>} */ (legend);
  const chars = new Set(rows.join(""));
  for (const ch of chars) if (typeof lg[ch] !== "string") session.add("D002", site, `grid(): the legend has no value for '${ch}'.`, `add "${ch}": "<value>" to the legend`);
  return new GridLiteral([rows[0].length, rows.length], [...new Set([...chars].map((c) => lg[c]).filter((v) => typeof v === "string"))].map(String));
}

/** Spawn points by hand. @param {unknown} kind @param {unknown} cells */
export function points(kind, cells) {
  if (typeof kind !== "string" || !Array.isArray(cells)) { session.add("D002", callSite(), "points(kind, cells) takes a kind and an array of [x, y] cells.", 'points("start", [[2, 2]])'); return new PointsLiteral("?", 0); }
  return new PointsLiteral(kind, cells.length);
}
