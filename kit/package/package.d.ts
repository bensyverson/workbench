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
}

export interface ForeignModule { module: string; targets: string[]; why: string }

/** A module that must be refused, and the diagnostic code it must be refused with. */
export interface Refusal { module: string; code: string }

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
  foreign: ForeignModule[];
  diagnostics: PackageDiagnostic[];
}
