// The stand-in for the `cave` dialect (docs/cave.md): records the builder calls and checks their arguments.

import { session, callSite } from "../session.js";
import { Part } from "../handles.js";
import * as arg from "../args.js";

/** @import { MethodSpec } from "../handles.js" */
/** @import { SeamType } from "../types.js" */

export const CELL_MEMBERS = ["x", "y", "cell", "size", "seed", "rand"];

export class CavePart extends Part {
  /** @param {string} name @param {import("../session.js").Site} site */
  constructor(name, site) {
    super("cave", name, site, { clock: "demand", target: "cpu" });
    /** @type {[number, number] | null} */
    this.size = null;
    /** @type {Map<string, number>} spawn kinds and counts */
    this.kinds = new Map();
  }

  /** @returns {Record<string, MethodSpec>} */
  methods() {
    return {
      ...super.methods(),
      size: { once: true, fn: ([cols, rows], ctx) => {
        if (arg.num(cols, ctx, "cols", { min: 8, max: 128 }) && arg.num(rows, ctx, "rows", { min: 8, max: 128 })) this.size = [/** @type {number} */ (cols), /** @type {number} */ (rows)];
      } },
      seed: { once: true, fn: ([n], ctx) => {
        if (arg.num(n, ctx, "the seed", { lambda: true }) && typeof n === "function") this.lambda(n, ctx, "cave.seed", []);
      } },
      carve: { once: true, fn: ([f], ctx) => { if (arg.fn(f, ctx, "the carve kernel", "c => bool")) this.lambda(f, ctx, "cave.carve", ["cell"]); } },
      smooth: { once: true, fn: ([n], ctx) => { arg.num(n, ctx, "passes", { min: 0, max: 8 }); } },
      spawns: { perKey: true, fn: ([kind, opts], ctx) => {
        if (!arg.str(kind, ctx, "the kind", /^[A-Za-z_]\w*$/)) return;
        if (!arg.obj(opts, ctx, "the options") || !arg.keys(opts, ctx, ["count", "where"])) return;
        if (arg.num(opts.count, ctx, "count", { min: 1, max: 64 }) && !this.kinds.has(/** @type {string} */ (kind))) this.kinds.set(/** @type {string} */ (kind), /** @type {number} */ (opts.count));
        if (opts.where !== undefined && arg.fn(opts.where, ctx, "where", "c => bool")) this.lambda(opts.where, ctx, "cave.spawns.where", ["cell"]);
      } },
      exit: { once: true, fn: ([opts], ctx) => {
        if (opts === undefined) return;
        if (!arg.obj(opts, ctx, "the options") || !arg.keys(opts, ctx, ["where"])) return;
        if (opts.where !== undefined && arg.fn(opts.where, ctx, "where", "c => bool")) this.lambda(opts.where, ctx, "cave.exit.where", ["cell"]);
      } },
    };
  }

  /** @returns {Map<string, SeamType>} */
  outputs() {
    return new Map([
      ["cells", { text: "Grid<'rock' | 'open'>@cell", kind: "grid", tag: "cell", values: ["rock", "open"], ...(this.size ? { shape: this.size } : {}) }],
      ["spawns", { text: "Spawn[]", kind: "array", kinds: this.kinds }],
      ["exit", { text: "vec2i@cell", kind: "vector", tag: "cell", numeric: true }],
    ]);
  }

  internals() { return ["grid", "map", "level", "spawnPoints", "seedValue"]; }

  finalize() {
    for (const m of ["size", "carve", "exit"]) {
      if (!this.called(m)) session.add("D003", this.site, `cave '${this.name}' has no .${m}(); it is required.`, m === "size" ? ".size(cols, rows)" : m === "carve" ? ".carve(c => …)" : ".exit({ where: c => … })");
    }
  }
}

/** A new cave part. @param {unknown} name */
export function cave(name) {
  const site = callSite();
  const p = new CavePart(typeof name === "string" ? name : "cave", site);
  if (typeof name !== "string") session.add("D002", site, "cave(name) takes a string name.", 'cave("depths")');
  return p.proxy();
}
