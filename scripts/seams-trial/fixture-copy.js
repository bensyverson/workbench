// The tests' fixture copies: a hand-in for one role made from fixtures/valid in a fresh temporary folder, edited,
// and re-hashed (unless the edit is meant to leave a package's hashes stale). The compose hand-in is assembled
// from the three: workbench.js beside copies of maze/ and particles/.

import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { hashDir } from "../pkg/dir.js";

export const FIXTURES = fileURLToPath(new URL("./fixtures/valid", import.meta.url));

/**
 * A copy of the hand-in for `role` with `edit(dir)` applied, then each package in it re-hashed unless `stale`.
 * @param {"maze" | "particles" | "compose"} role @param {(dir: string) => void | Promise<void>} [edit] @param {{ stale?: boolean }} [o]
 */
export async function handIn(role, edit = () => {}, { stale = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "C0nNGy-st-"));
  if (role === "compose") {
    cpSync(join(FIXTURES, "compose"), dir, { recursive: true });
    for (const p of ["maze", "particles"]) cpSync(join(FIXTURES, p), join(dir, p), { recursive: true });
  } else cpSync(join(FIXTURES, role), dir, { recursive: true });
  await edit(dir);
  if (!stale) {
    if (role === "compose") for (const p of ["maze", "particles"]) await hashDir(join(dir, p));
    else await hashDir(dir);
  }
  return dir;
}

/** Replaces the one `from` in `dir/file` with `to`. @param {string} dir @param {string} file @param {string} from @param {string} to */
export function sub(dir, file, from, to) {
  const t = readFileSync(join(dir, file), "utf8");
  assert.ok(t.includes(from), `fixture edit: '${from}' not in ${file}`);
  writeFileSync(join(dir, file), t.replace(from, () => to));
  return dir;
}

/** @param {string} dir */
export const remove = (dir) => rmSync(dir, { recursive: true, force: true });
