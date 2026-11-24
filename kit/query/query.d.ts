// Read-only queries over IR Kernels: who writes a place, what a region reads, which helpers it
// reaches, and whether it is pure. Nothing here changes a Kernel.

import type { Kernel, Stmt, Expr, Effect, Span } from "../ir/ir.js";

/** One node of a Kernel's body. */
export type Node = Stmt | Expr;

/** Where a query looks: a whole Kernel (its body), some statements (a loop's body), one statement or one expression. */
export type Region = Kernel | Node | Stmt[];

/** What `walk` calls for each node, in evaluation order (a node before its children). */
export type Visit = (node: Node) => void;

/** A place a region loads. */
export interface ReadSite {
  /** `owner.name`, as an effect names it: `Mole.ttl`, `Uniforms.k`. */
  place: string;
  owner: string;
  name: string;
  /** True for state (a place with a store rule, whose load is a `read` effect); false for a read-only place such as a uniform. */
  state: boolean;
  /** The Kernel the load is in: the region's, or the helper's it was found through. */
  kernel: string;
  span: Span;
}

/** A call a region makes: a Dialect intrinsic, a program method, or a helper. */
export interface CallSite {
  k: "call" | "method" | "helper";
  /** The intrinsic's path (`w.param`, `mix`), `Owner.name` for a method, the helper's name. */
  fn: string;
  /** The call's recorded effects: `read param pace`, `call nth`. */
  effects: Effect[];
  kernel: string;
  span: Span;
}

/** What a region reads, helpers looked through. */
export interface Reads {
  /** Every load, in evaluation order (one entry per site). */
  loads: ReadSite[];
  /** Every call, in evaluation order. */
  calls: CallSite[];
  /** The helpers the region reaches, in the order first reached; their bodies' loads and calls are in the lists above. */
  helpers: Kernel[];
}

/** How a site writes a place. */
export type WriteVia = "store" | "call" | "method" | "helper";

/** A site that writes a place: a store to it, or a call whose recorded effects write it. */
export interface WriteSite {
  place: string;
  via: WriteVia;
  kernel: string;
  span: Span;
  node: Node;
}

/** One Kernel's effects that keep it from being pure. */
export interface Impure {
  kernel: Kernel;
  effects: Effect[];
}

export interface ReadsOptions {
  /** The helpers a `helper` call may reach, looked up by name. A helper not given is a call and nothing more. */
  helpers?: Kernel[];
  /** The Kernel a region that is not a whole Kernel belongs to, for its sites' `kernel`. */
  kernel?: string;
}
