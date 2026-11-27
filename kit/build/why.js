
// The why text: a pure formatter from build events and the input log to text an agent reads cold. It says what
// rebuilt and into which revision, at which instant boundary, triggered by what (a param build-time code read, with
// the input that set it and where it was read; a package key change; a glue edit; a kit upgrade), what changed (the
// content key, the record's fields, each Kernel), and which consumers now see a new revision. A rebuild whose key
// did not change says so on its first line. No I/O: the text is a function of its arguments, so a replay gives the
// same text. Format and trial: project/2026-11-26-why-text-trial-findings.md.

import { edgeText } from "../seam/index.js";

/** @typedef {import("./event.js").BuildEvent} BuildEvent */
/** `wire`: the output a param wire set the param from (kit/run marks the inputs it makes). @typedef {{ kind: string, T: string, part?: string, name?: string, value?: unknown, wire?: string }} LogInput */
/** @typedef {{ header?: unknown, inputs: LogInput[] }} RunLog */
/**
 * `inputs`: list the log's inputs after this time (exclusive) through the build's boundary; null from the run's
 * start; left out, no inputs line. `span`: the log positions to list instead (after, through), when the events say
 * them (`input`). `readBefore`: the revision the consumers last read, when it is not `revision.before` (an earlier
 * build at the same stamp was superseded). `landed`: when the part's previous changed build landed, if it did at an
 * earlier stamp (`landedRight`: right after the instant at it). `superseded`: the revision of the next changed build
 * at the same boundary. `later`: the next changed build, at a later boundary, as `{ revision, before, right }`.
 * @typedef {{ log?: RunLog, base?: string, inputs?: string | null, span?: { after: number, through: number }, readBefore?: number, landed?: string, landedRight?: boolean, superseded?: number, later?: { revision: number, before: string, right: boolean } }} FormatOptions
 */

/** A rational's text ("1/3", "6/5", "2") as a number. @param {string} t */
const seconds = (t) => {
  const [n, d = "1"] = t.split("/");
  return Number(n) / Number(d);
};

/** A time as the run log writes it, with seconds in decimals when it is not whole: `T=1/3 (0.333 s)`, `T=1 s`. @param {string} t */
export function timeText(t) {
  if (!t.includes("/")) return `T=${t} s`;
  return `T=${t} (${Number(seconds(t).toFixed(3))} s)`;
}

/** A content key cut to six characters of its hash: `sha256-Il/pah…`. @param {string | null} k */
const short = (k) => (k === null ? "none" : k.startsWith("sha256-") ? `${k.slice(0, 13)}…` : k);

/** A value as the text reads it. @param {unknown} v */
const val = (v) => (typeof v === "string" ? JSON.stringify(v) : v === undefined ? "unset" : JSON.stringify(v));

/** A file with the base dropped. @param {string} file @param {string} [base] */
const where = (file, base) => (base && file.startsWith(base) ? file.slice(base.length) : file);

/**
 * The param input in the log that set this value, the latest at or before the boundary.
 * @param {RunLog | undefined} log @param {string} part @param {string} name @param {unknown} value @param {string} before @param {number} [through] the log position the build was applied at, when known
 */
function setBy(log, part, name, value, before, through) {
  const at = seconds(before);
  const hits = (log?.inputs ?? []).filter((e, i) => e.kind === "param" && e.part === part && e.name === name && JSON.stringify(e.value) === JSON.stringify(value) && (through === undefined ? seconds(e.T) <= at : i <= through));
  return hits.at(-1) ?? null;
}

/** The trigger, as one or two lines. @param {BuildEvent} e @param {FormatOptions} o @returns {string[]} */
function because(e, o) {
  const t = /** @type {any} */ (e.trigger);
  if (t.kind === "param") {
    const input = setBy(o.log, e.part, t.param, t.to, e.boundary.before, e.input);
    const by = !input ? "" : input.wire ? `, set by the wire ${input.wire} → ${e.part}.param.${t.param}, in a param input stamped ${timeText(input.T)}` : `, set by a param input stamped ${timeText(input.T)}`;
    const first = `param ${e.part}.$.${t.param} changed ${val(t.from)} → ${val(t.to)}${by}`;
    const reads = (/** @type {Array<{ file: string, line: number, by: string | null }>} */ (t.reads)).map((r) => `${where(r.file, o.base)}:${r.line}${r.by ? ` (before ${r.by})` : ""}`);
    return reads.length ? [first, `read at build time at ${reads.join(", ")}`] : [first];
  }
  if (t.kind === "package") return [`package changed ${short(t.from)} → ${short(t.to)}${t.files.length ? ` (files: ${t.files.join(", ")})` : ""}`];
  if (t.kind === "glue") return [t.call ? `glue edit of ${t.call}` : "glue edit (the call was not recorded)"];
  if (t.kind === "kit") return [`kit upgraded ${t.from} → ${t.to}`];
  return [`${t.kind}`];
}

/** Each Kernel's fate in one line. @param {BuildEvent["kernels"]} k */
function kernelsText(k) {
  const parts = [
    ...k.changed.map((i) => `${i} recompiled`),
    ...k.added.map((i) => `${i} added`),
    ...k.removed.map((i) => `${i} removed`),
  ];
  if (k.unchanged.length) parts.push(`${k.unchanged.join(", ")} unchanged`);
  return parts.length ? parts.join("; ") : "none";
}

/** A labeled line, the labels aligned. @param {string} label @param {string} text */
const line = (label, text) => `  ${(label ? `${label}:` : "").padEnd(13)}${text}`;

/**
 * One build event as text.
 * @param {BuildEvent} e @param {FormatOptions} [o]
 */
export function formatBuild(e, o = {}) {
  const { after, before } = e.boundary;
  // a boundary whose two sides are one instant is the one right after it (a param wire's input: kit/run)
  const right = rightAfter(e);
  const at = after === null ? `before the first instant, ${timeText(before)}` : right ? `right after instant ${timeText(after)} (before the next instant)` : `after instant ${timeText(after)}, at ${timeText(before)} (before the next instant)`;
  const out = [];
  const [first, ...more] = because(e, o);
  if (!e.ok) {
    out.push(`build ${e.part} FAILED ${at}; ${e.part}@${e.revision.before} keeps running`);
    out.push(line("because", first), ...more.map((m) => line("", m)));
    out.push(line("diagnostics", e.diagnostics.map((d) => { const x = /** @type {any} */ (d); return `${x.code} ${x.message}`; }).join("; ")));
    if (o.inputs !== undefined) out.push(line("inputs", inputsText(o.log, o.inputs, before, o.span)));
    return out.join("\n");
  }
  const rev = `${e.part}@${e.revision.after}`;
  out.push(e.changed ? `build ${rev} ${at}` : `build ${rev} ${at}: rebuilt, nothing changed; revision kept`);
  out.push(line("because", first), ...more.map((m) => line("", m)));
  const fields = e.record.length ? e.record.join(", ") : "none";
  out.push(line("key", e.changed ? `${short(e.key.before)} → ${short(e.key.after)} (record changed: ${fields})` : `${short(e.key.before)} unchanged`));
  out.push(line("kernels", kernelsText(e.kernels)));
  if (e.edges?.length) out.push(line("edges", e.edges.map((m) => `${m.from} → ${m.to} ${m.before ? edgeText(m.before) : "(none)"} → ${m.after ? edgeText(m.after) : "(none)"}`).join("; ")));
  const who = e.consumers.join(", ");
  out.push(line("consumers", !e.consumers.length ? "none"
    : !e.changed ? `${who} keep reading ${rev} (no new revision)`
    : o.superseded !== undefined ? `${who} never read ${rev}: superseded by ${e.part}@${o.superseded} before any consumer step`
    : `${who} read ${e.part}@${o.readBefore ?? e.revision.before} ${o.landed === undefined ? `at every step ${right ? "through" : "before"}` : `at every step ${o.landedRight ? "after" : "from"} ${timeText(o.landed)} ${right ? "through" : "until"}`} ${timeText(before)}, and ${rev} ($rev ${e.revision.after}) ${o.later ? `at any step ${right ? "after" : "from"} ${timeText(before)} until ${e.part}@${o.later.revision} landed ${o.later.right ? "right after" : "at"} ${timeText(o.later.before)}` : right ? "from their first step after it" : "from their first step at or after it"}`));
  if (o.inputs !== undefined) out.push(line("inputs", inputsText(o.log, o.inputs, before, o.span)));
  return out.join("\n");
}

/** One input of the log, short: `T=1/4 (0.25 s) game pad right`. @param {LogInput} e */
function inputText(e) {
  const v = /** @type {any} */ (e.value);
  if (e.kind === "param") return `${timeText(e.T)} ${e.part}.$.${e.name} = ${val(v)}${e.wire ? ` (wire ${e.wire})` : ""}`;
  if (e.kind === "rebuild") return `${timeText(e.T)} ${e.part} rebuild`;
  const held = v && typeof v === "object" && Object.values(v).every((x) => typeof x === "boolean");
  return `${timeText(e.T)} ${e.part} ${e.name} ${held ? Object.keys(v).filter((k) => v[k]).join("+") || "none" : val(v)}`;
}

/**
 * The log's inputs after `since` (exclusive; null: from the start) through `through`, frames left out; by log
 * position when `span` gives it, so two builds at one stamp split the inputs by their order in the log.
 * @param {RunLog | undefined} log @param {string | null} since @param {string} through @param {{ after: number, through: number }} [span]
 */
function inputsText(log, since, through, span) {
  const lo = since === null ? -Infinity : seconds(since), hi = seconds(through);
  const list = (log?.inputs ?? []).filter((e, i) => e.kind !== "frame" && (span ? i > span.after && i <= span.through : seconds(e.T) > lo && seconds(e.T) <= hi));
  return `${since === null ? "since the run started" : `since ${timeText(since)}`}: ${list.length ? list.map(inputText).join("; ") : "none"}`;
}

/**
 * The directory every build-time read in these events shares, as a URL prefix ending in "/": read paths are shown
 * relative to it. "" when there are no reads, or the files share no directory.
 * @param {BuildEvent[]} builds
 */
export function readBase(builds) {
  const files = builds.flatMap((e) => (e.trigger.kind === "param" ? e.trigger.reads.map((r) => r.file) : []));
  if (!files.length) return "";
  let prefix = files[0];
  for (const f of files) while (!f.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.slice(0, prefix.lastIndexOf("/") + 1);
}

/**
 * The why text for a part (or every part), from the run's build events and its log. Read paths are relative to the
 * directory the reads share unless `base` says otherwise ("" keeps them whole).
 * @param {BuildEvent[]} builds @param {RunLog} log @param {{ part?: string, since?: string, base?: string }} [o]
 */
export function why(builds, log, o = {}) {
  o = { ...o, base: o.base ?? readBase(builds) };
  const mine = builds.filter((e) => (o.part === undefined || e.part === o.part) && (o.since === undefined || seconds(e.boundary.before) >= seconds(o.since)));
  const n = mine.length;
  const count = `${n} rebuild${n === 1 ? "" : "s"} ${o.since === undefined ? "in the run log" : `since ${timeText(o.since)}`}`;
  /** @param {BuildEvent} e */
  const text = (e) => `\n${formatBuild(e, { log, base: o.base, ...context(builds, e) })}`;
  if (o.part !== undefined) {
    const all = builds.filter((e) => e.part === o.part);
    if (!all.length) return `why ${o.part}: no rebuilds in the run log; ${o.part}@1 since the run started`;
    const now = all.at(-1)?.revision.after;
    return [`why ${o.part}: ${count}; ${o.part}@${now} now`, ...mine.map(text)].join("\n");
  }
  return [`why: ${count}`, ...mine.map(text)].join("\n");
}

/**
 * Whether two builds landed on one boundary, with no instant between them: the same stamp is not enough, since a
 * build right after an instant (a param wire's) shares its stamp with one just before it.
 * @param {BuildEvent} a @param {BuildEvent} b
 */
const same = (a, b) => a.boundary.before === b.boundary.before && a.boundary.after === b.boundary.after;

/** Whether a build landed right after an instant: its boundary's two sides are that one instant. @param {BuildEvent} e */
const rightAfter = (e) => e.boundary.after === e.boundary.before;

/**
 * What one build's text needs of the part's other builds: the inputs since its previous build (by log position when
 * the events carry it), and, for a changed build, what its consumers read before and after it. Builds at one stamp
 * land before any consumer step, so all but the last of them are superseded.
 * @param {BuildEvent[]} builds @param {BuildEvent} e @returns {FormatOptions}
 */
function context(builds, e) {
  const mine = builds.filter((x) => x.part === e.part);
  const k = mine.indexOf(e);
  const prev = mine[k - 1];
  /** @type {FormatOptions} */
  const out = { inputs: prev ? prev.boundary.before : null };
  if (e.input !== undefined && (!prev || prev.input !== undefined)) out.span = { after: prev?.input ?? -1, through: e.input };
  const changed = (/** @type {BuildEvent} */ x) => x.ok && x.changed;
  if (!changed(e)) return out;
  const next = mine.slice(k + 1).find(changed);
  if (next) {
    if (same(next, e)) out.superseded = next.revision.after;
    else out.later = { revision: next.revision.after, before: next.boundary.before, right: rightAfter(next) };
  }
  const earlier = mine.slice(0, k).filter(changed);
  let at = earlier.length - 1;
  while (at >= 0 && same(earlier[at], e)) out.readBefore = earlier[at--].revision.before;
  if (at >= 0) Object.assign(out, { landed: earlier[at].boundary.before, landedRight: rightAfter(earlier[at]) });
  return out;
}
