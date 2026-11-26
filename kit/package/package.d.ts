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

export interface Manifest {
  name: string;
  version: string;
  kit: string;
  description?: string;
  entry: { dialect: string; grammar: string; ui?: string };
  lib?: string[];
  foreign?: ForeignModule[];
  elements?: string[];
  examples?: string[];
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
  /** The content key: the hash over the manifest's `files`. */
  content: string | null;
  dialect: unknown;
  grammar: unknown;
  ui: unknown;
  /** The manifest's example paths, for the host to import. */
  examples: string[];
  foreign: ForeignModule[];
  diagnostics: PackageDiagnostic[];
}
