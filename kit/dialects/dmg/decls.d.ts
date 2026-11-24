// What one DMG program declares, as plain data: the input to `dmgEnvironment`. The
// oracle side reads it from a built spec (scripts/dmg-oracle/declarations.js); tests
// write it by hand. Nothing here is DMG code, only the shape of a program.

export type AttrType = "u8" | "i8" | "u16" | "i16" | "bool" | "fix" | "enum";

export interface AttrDecl { type: AttrType; min?: number; max?: number; values?: string[] }

export interface PartDecl {
  attrs: Record<string, AttrDecl>;
  /** Names of the methods the part defines, its fragments' included. */
  methods: string[];
}

export interface CompDecl extends PartDecl {
  /** Constants `bake` adds per instance, by value type. Read-only at run time. */
  baked: Record<string, "f64" | "str" | "bool">;
  /** Sprite names, in declaration order. */
  sprites: string[];
  /** How many entities of this kind the program has, pools included: bounds `w.all(kind)`. */
  count: number;
}

export interface ParamDecl {
  kind: "slider" | "toggle" | "choice";
  live: boolean;
  /** A choice's options. */
  options?: Array<string | number>;
}

export interface DmgDeclarations {
  /** The Game's name. */
  game: string;
  world: PartDecl;
  comps: Record<string, CompDecl>;
  params: Record<string, ParamDecl>;
  pools: Record<string, { comp: string; size: number }>;
  /** The board's component and cell count, when the game has a board. */
  board: { comp: string; size: number } | null;
  grid: { rows: number; cols: number } | null;
  /** Placed entities the world exposes by name, e.g. `w.hammer`. */
  aliases: Record<string, string>;
  sfx: string[];
}
