// Reads what a built DMG program declares (attributes and their types, baked
// constants, methods, params, pools, the board) into the plain data the kit's DMG
// dialect is built from.

/** @import { DmgSpec, PartSpec } from "./dmg.js" */
/** @import { DmgDeclarations, PartDecl, AttrDecl, AttrType } from "../../kit/dialects/dmg/decls.js" */

/**
 * @param {DmgSpec} spec
 * @returns {DmgDeclarations}
 */
export function declarationsOf(spec) {
  /** @type {DmgDeclarations["comps"]} */
  const comps = {};
  for (const [name, c] of Object.entries(spec.comps)) {
    const insts = spec.inst.filter((i) => i.spec.name === name);
    /** @type {Record<string, "f64" | "str" | "bool">} */
    const baked = {};
    for (const [k, v] of Object.entries(insts[0]?.baked ?? {})) {
      // A baked array or object has no IR type yet; leaving it out makes a use of it an unknown member.
      if (typeof v === "number") baked[k] = "f64";
      else if (typeof v === "string") baked[k] = "str";
      else if (typeof v === "boolean") baked[k] = "bool";
    }
    comps[name] = { ...part(c), baked, sprites: [...c.spriteOrder], count: insts.length };
  }
  /** @type {DmgDeclarations["pools"]} */
  const pools = {};
  /** @type {Record<string, string>} */
  const aliases = {};
  for (const i of spec.inst) {
    if (i.pool) pools[i.pool] = { comp: i.spec.name, size: (pools[i.pool]?.size ?? 0) + 1 };
    if (i.alias) aliases[i.alias] = i.spec.name;
  }
  const board = spec.inst.filter((i) => i.group === "board");
  return {
    game: spec.name,
    world: part(spec.world),
    comps,
    params: Object.fromEntries(Object.entries(spec.params).map(([k, p]) => [k, {
      kind: p.ctrl.kind, live: p.live, ...(p.ctrl.kind === "choice" ? { options: [...(p.ctrl.options ?? [])] } : {}),
    }])),
    pools,
    board: board.length ? { comp: board[0].spec.name, size: board.length } : null,
    grid: spec.grid ? { rows: spec.grid.rows, cols: spec.grid.cols } : null,
    aliases,
    sfx: Object.keys(spec.sfx),
  };
}

/**
 * @param {PartSpec} p
 * @returns {PartDecl}
 */
function part(p) {
  /** @type {Record<string, AttrDecl>} */
  const attrs = {};
  for (const [k, a] of Object.entries(p.attrs)) {
    /** @type {AttrDecl} */
    const d = { type: /** @type {AttrType} */ (a.type) };
    if (a.min != null) d.min = a.min;
    if (a.max != null) d.max = a.max;
    if (a.type === "enum") d.values = [...(a.values ?? [])];
    attrs[k] = d;
  }
  return { attrs, methods: Object.keys(p.methods) };
}
