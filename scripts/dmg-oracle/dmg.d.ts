// The parts of the DMG Workbench's DSL that the oracle touches. The DSL is untyped
// JavaScript loaded from project/2026-11-23-dmg-workbench.html; these types
// describe only what the harness reads or replaces, so everything else stays loose.

/** Any runtime lambda: the DMG calls them with different arities per slot. */
export type Lambda = (...args: any[]) => unknown;

/** A record holding one lambda in the compiled spec; the runtime reads `fn` live. */
export interface FnRecord {
  fn: Lambda;
  line?: number;
  /** The part that declared it (a component, fragment or Game name); absent on draw, timer, done, bot. */
  owner?: string;
}

/** A merged part (component, or the world) in the compiled spec. */
export interface PartSpec {
  name: string;
  kind: string;
  frames: FnRecord[];
  methods: Record<string, FnRecord>;
  on: Record<string, FnRecord[]>;
  inits: FnRecord[];
  huds: FnRecord[];
  draw: FnRecord | null;
  attrs: Record<string, { name: string; type: string; init: unknown; owner: string; min?: number; max?: number; values?: string[] }>;
  /** A component's sprite names, in declaration order. */
  spriteOrder: string[];
}

/** One entity the program places, boards or pools. */
export interface InstanceSpec {
  spec: PartSpec;
  group: "place" | "board" | "pool";
  alias?: string;
  pool?: string;
  /** The constants `bake` set on this instance. */
  baked: Record<string, unknown>;
}

export interface ParamSpec {
  ctrl: { kind: "slider" | "toggle" | "choice"; options?: Array<string | number> };
  live: boolean;
}

export interface TimerSpec {
  name: string;
  fn: Lambda;
  every: { fn?: Lambda; k?: number; dyn?: string } | null;
  after: { fn?: Lambda; k?: number; dyn?: string } | null;
  once: boolean;
}

export interface DmgSpec {
  name: string;
  world: PartSpec;
  comps: Record<string, PartSpec>;
  timers: TimerSpec[];
  done: FnRecord | null;
  bot: FnRecord | null;
  inst: InstanceSpec[];
  params: Record<string, ParamSpec>;
  sfx: Record<string, unknown>;
  grid: { rows: number; cols: number } | null;
}

export interface LogEntry { f: number; t: string; name: string; data: unknown }

/** Per-entity runtime state, as the runtime's `_tmap` holds it. */
export interface EntState {
  v: Record<string, unknown>;
  x: number;
  y: number;
  visible: boolean;
  alive: boolean;
}

export interface DmgRuntime {
  frame: number;
  over: boolean;
  overReason: string;
  err: Error | null;
  wv: Record<string, unknown>;
  oamStart: number;
  fb: Uint8Array;
  bg: { map: Uint16Array; scx: number; scy: number; ts: { names: string[] } };
  ents: Array<{ kind: string; alive: boolean }>;
  /** The world proxy that lambdas receive. */
  w: object;
  /** The compiled spec the runtime runs. */
  s: DmgSpec;
  /** The seeded RNG; replaced by every reset. */
  rnd: (...args: unknown[]) => number;
  _tmap: Map<unknown, EntState>;
  _tick(buttons: string[]): void;
  /** What the bot lambda would press now, or null when the build has none. A throwing bot fails the runtime. */
  botInput(): string[] | null;
  /** Sets a live param; throws for unknown or build-time params. */
  set(name: string, value: unknown): void;
  reset(): void;
  render(): void;
}

export interface RuntimeOptions {
  seed?: number;
  hooks?: { onLog?: (e: LogEntry) => void };
}

export interface DmgBuild {
  name: string;
  spec: DmgSpec;
  runtime(opts?: RuntimeOptions): DmgRuntime;
}

export interface DmgDSL {
  run(code: string, opts?: { overrides?: Record<string, unknown> }): { build: DmgBuild | null; error: Error | null };
}

export interface DmgPreset { id: string; group: string; title: string; sub: string; code: string; notes: string }
