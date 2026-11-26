// A build event: what one rebuild of a part did, as data complete enough to write its "why" later (the build
// record draft's "Why it rebuilt"; the human-facing text waits on its trial). Triggers come from what is already
// recorded: a param's build-time reads (`record.reads`), a package's two content keys and file maps, a glue edit.

import { canonical, keyed } from "./key.js";

/** @typedef {{ kind: "param", param: string, from: unknown, to: unknown, reads: Array<{ file: string, line: number, by: string | null }> }} ParamTrigger */
/** @typedef {{ kind: "package", from: string | null, to: string | null, files: string[] }} PackageTrigger */
/** @typedef {{ kind: "glue", call: string | null }} GlueTrigger */
/** @typedef {ParamTrigger | PackageTrigger | GlueTrigger | { kind: "kit", from: string, to: string }} Trigger */
/**
 * One side of a rebuild: the content key, the revision (known before), the built record and each Kernel's emitted
 * source by lambda id.
 * @typedef {{ key: string, revision?: number, record: Record<string, any>, kernels: Record<string, string> }} BuildSide
 */
/**
 * A build event, as the run log keeps it. `boundary` is the instant boundary it landed on: after the instant
 * `after` (null before the first) and before `before`, each as rational text; the two equal is the boundary right
 * after that instant (a param wire's input). `changed` is whether the key did;
 * `record` lists the record's top-level keys that differ; `consumers` the inputs fed by this part's outputs; `input`
 * (kit/run sets it) the position in the run log's inputs of the one that applied the rebuild, so the why text can
 * split inputs between builds at one stamp.
 * @typedef {{ kind: "build", part: string, boundary: { after: string | null, before: string }, trigger: Trigger, ok: boolean, changed: boolean, key: { before: string, after: string | null }, revision: { before: number, after: number }, record: string[], kernels: { changed: string[], added: string[], removed: string[], unchanged: string[] }, consumers: string[], diagnostics: unknown[], input?: number }} BuildEvent
 */

/**
 * A param change's trigger: the value before and after, and where build-time code read it (from the record's
 * `reads`: file, line and the builder call made next).
 * @param {Record<string, any>} record @param {string} param @param {unknown} from @param {unknown} to
 * @returns {ParamTrigger}
 */
export function paramTrigger(record, param, from, to) {
  const reads = (/** @type {any[]} */ (record.reads ?? [])).filter((r) => r.param === param).map((r) => ({ file: r.file, line: r.loc?.start?.line ?? 0, by: r.by ?? null }));
  return { kind: "param", param, from, to, reads };
}

/**
 * A package swap's trigger: the two content keys, and the files whose hashes differ (added, removed or changed),
 * when both `files` maps are known.
 * @param {{ key: string | null, files?: Record<string, string> }} from @param {{ key: string | null, files?: Record<string, string> }} to
 * @returns {PackageTrigger}
 */
export function packageTrigger(from, to) {
  /** @type {string[]} */
  let files = [];
  if (from.files && to.files) {
    const a = from.files, b = to.files;
    files = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
  }
  return { kind: "package", from: from.key, to: to.key, files };
}

/** A glue edit's trigger: the call that changed, when the host knows it. @param {string} [call] @returns {GlueTrigger} */
export const glueTrigger = (call) => ({ kind: "glue", call: call ?? null });

/**
 * The build event of one rebuild. `after` is null when the rebuild failed: the previous revision keeps running and
 * the event carries the diagnostics.
 * @param {{ part: string, boundary: BuildEvent["boundary"], trigger: Trigger, before: BuildSide & { revision: number }, after: BuildSide | null, consumers: string[], diagnostics?: unknown[], input?: number }} o
 * @returns {BuildEvent}
 */
export function buildEvent({ part, boundary, trigger, before, after, consumers, diagnostics = [], input }) {
  const ok = after !== null;
  const changed = ok && after.key !== before.key;
  // the fields are compared as the key sees them, so a param's new value alone is no changed field
  const was = keyed(before.record), now = ok ? keyed(after.record) : was;
  const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
  const record = changed ? keys.filter((k) => canonical(was[k]) !== canonical(now[k])) : [];
  const a = before.kernels, b = ok ? after.kernels : before.kernels;
  const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return {
    kind: "build", part, boundary, trigger, ok, changed,
    key: { before: before.key, after: ok ? after.key : null },
    revision: { before: before.revision, after: changed ? before.revision + 1 : before.revision },
    record,
    kernels: {
      changed: ids.filter((i) => i in a && i in b && a[i] !== b[i]),
      added: ids.filter((i) => !(i in a) && i in b),
      removed: ids.filter((i) => i in a && !(i in b)),
      unchanged: ids.filter((i) => i in a && i in b && a[i] === b[i]),
    },
    consumers,
    diagnostics,
    ...(input === undefined ? {} : { input }),
  };
}
