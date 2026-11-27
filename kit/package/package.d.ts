// The package module's types.

export interface PackageDiagnostic {
  code: string;
  severity: "error";
  message: string;
  fix: string;
  /** The package file the problem is in, when it is in one. */
  file?: string;
  /** 1-based, for a problem in a .js file. */
  line?: number;
  /** The manifest test a K020 or K021 is about. */
  test?: string;
}

export interface ForeignModule { module: string; targets: string[]; why: string }

/** A module that must be refused, and the diagnostic code it must be refused with. */
export interface Refusal { module: string; code: string }

/** One expectation of a test: exactly one of the kinds `state`, `output`, `events` or `diagnostic` (README.md, "Tests"). */
export type TestExpect =
  | { at: number | string; state: Record<string, unknown>; within?: number }
  | { at: number | string; output: string; value: unknown; within?: number }
  | { events: string; from?: number | string; to?: number | string; records: Record<string, unknown>[]; within?: number }
  | { events: string; from?: number | string; to?: number | string; count: number }
  | { diagnostic: string; at?: number | string };

/** A manifest `tests` entry: one example alone, timed records on its Event inputs, and what to expect. */
export interface ManifestTest {
  name: string;
  example: string;
  inputs: Array<{ T: number | string; in: string; value: Record<string, unknown> }>;
  expect: TestExpect[];
  until?: number | string;
  seed?: number;
}

export interface Manifest {
  name: string;
  version: string;
  kit: string;
  description?: string;
  entry: { dialect: string; grammar: string; ui?: string; runtime?: string };
  lib?: string[];
  foreign?: ForeignModule[];
  elements?: string[];
  examples?: string[];
  refusals?: Refusal[];
  tests?: ManifestTest[];
  /** Every file but the manifest: path to `sha256-<base64>`. */
  files: Record<string, string>;
}

/** One static import or re-export of a module: `start`..`end` is the specifier's text, without its quotes. */
export interface ModuleImport {
  specifier: string;
  /** `kit/define`, or the package path a relative specifier names; null when the import is refused. */
  resolved: string | null;
  line: number;
  start: number;
  end: number;
}

/** What loadPackage returns; the loaded parts are null when diagnostics is not empty. */
export interface LoadedPackage {
  name: string | null;
  version: string | null;
  /** The content key: the hash over the manifest's `files` and the manifest text (see contentKey). */
  content: string | null;
  dialect: unknown;
  grammar: unknown;
  ui: unknown;
  runtime: unknown;
  /** The manifest's example paths, for the host to import. */
  examples: string[];
  /** The manifest's refusals, for checkExamples. */
  refusals: Refusal[];
  /** The manifest's tests, for checkTests and kit/page's runTests; empty when it has none. */
  tests: ManifestTest[];
  foreign: ForeignModule[];
  /** Every data file the Dialect reads (kit/define's dataFiles), by path; empty when the package did not load. */
  data: Record<string, DataFile>;
  diagnostics: PackageDiagnostic[];
}

/** The files a host holds: each path's text, or its bytes. */
export type PackageFiles = Record<string, string | Uint8Array>;

/** One loaded data file. `text` for text, json and csv (`value` the parsed JSON); `bytes`, `width` and `height` for an image. */
export interface DataFile {
  path: string;
  kind: "text" | "json" | "csv" | "image";
  /** Where the Dialect names it: `files.<name>` or `images.<image>`. */
  from: string;
  text?: string;
  value?: unknown;
  bytes?: Uint8Array;
  width?: number;
  height?: number;
}
