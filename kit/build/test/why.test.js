// The why text: a pure formatter from build events (kit/build's shape) and the run log to text an agent reads cold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBuild, why, timeText } from "../why.js";

const KEY_A = "sha256-Il/pahv+PhP81+nqqrlKJli5aaN1Fi4215WGa5gYg08=";
const KEY_B = "sha256-uYokOUBIzQXNkn3IVjgp72uJEppFPfWew1PWt8s+wCc=";

/** A changed param rebuild of the cave, as kit/run writes it. @param {any} [o] */
const paramBuild = (o = {}) => ({
  kind: "build", part: "cave", boundary: { after: "3/10", before: "1/3" },
  trigger: { kind: "param", param: "depth", from: 0, to: 3, reads: [{ file: "file:///w/scenario/glue.js", line: 12, by: "cave.grid" }] },
  ok: true, changed: true, key: { before: KEY_A, after: KEY_B }, revision: { before: 1, after: 2 },
  record: ["exit", "grid", "params", "start"], kernels: { changed: [], added: [], removed: [], unchanged: ["cave.shade"] },
  consumers: ["game.in.start", "game.in.exit"], diagnostics: [], ...o,
});

const LOG = { header: { name: "glowworm-deep" }, inputs: [
  { kind: "control", T: "1/30", part: "game", name: "pad", value: { right: true } },
  { kind: "param", T: "1/3", part: "cave", name: "depth", value: 3 },
] };

test("a time is its rational text, with seconds in decimals when it is not whole", () => {
  assert.equal(timeText("1/3"), "T=1/3 (0.333 s)");
  assert.equal(timeText("1"), "T=1 s");
  assert.equal(timeText("6/5"), "T=6/5 (1.2 s)");
});

test("a param rebuild says the new revision, when, the param and its values, the input that set it, and where build code read it", () => {
  const text = formatBuild(paramBuild(), { log: LOG, base: "file:///w/" });
  const lines = text.split("\n");
  assert.equal(lines[0], "build cave@2 after instant T=3/10 (0.3 s), at T=1/3 (0.333 s) (before the next instant)");
  assert.match(text, /because: +param cave\.\$\.depth changed 0 → 3, set by a param input stamped T=1\/3 \(0\.333 s\)/);
  assert.match(text, /read at build time at scenario\/glue\.js:12 \(before cave\.grid\)/);
});

test("a changed rebuild names the key change, the record fields that differ and each Kernel's fate", () => {
  const text = formatBuild(paramBuild({ kernels: { changed: ["cave.shade"], added: ["cave.glint"], removed: [], unchanged: [] } }), { log: LOG });
  assert.match(text, /key: +sha256-Il\/pah… → sha256-uYokOU… \(record changed: exit, grid, params, start\)/);
  assert.match(text, /kernels: +cave\.shade recompiled; cave\.glint added/);
});

test("consumers are said to have read the old revision before the boundary and to see the new one from their first step after it", () => {
  assert.match(formatBuild(paramBuild(), { log: LOG }), /consumers: +game\.in\.start, game\.in\.exit read cave@1 at every step before T=1\/3 \(0\.333 s\), and cave@2 \(\$rev 2\) from their first step at or after it/);
});

test("a changed params field is a changed declaration, said as any other field (a param's value is not in the key)", () => {
  const text = formatBuild(paramBuild({ record: ["params"] }), { log: LOG });
  assert.match(text, /\(record changed: params\)/);
  assert.doesNotMatch(text, /params only/);
});

test("why() lists the log's inputs since the part's previous build, through this one", () => {
  const log = { inputs: [LOG.inputs[0], { kind: "control", T: "1/4", part: "game", name: "pad", value: { up: false, right: false } }, LOG.inputs[1],
    { kind: "param", T: "1", part: "cave", name: "roughness", value: 46 }, { kind: "rebuild", T: "6/5", part: "cave", record: {} }] };
  const second = paramBuild({ boundary: { after: "29/30", before: "1" }, revision: { before: 2, after: 3 }, trigger: { kind: "param", param: "roughness", from: 45, to: 46, reads: [] } });
  const text = why([paramBuild(), second], log, { part: "cave" });
  assert.match(text, /inputs: +since the run started: T=1\/30 \(0\.033 s\) game pad right; T=1\/4 \(0\.25 s\) game pad none; T=1\/3 \(0\.333 s\) cave\.\$\.depth = 3\n/);
  assert.match(text, /inputs: +since T=1\/3 \(0\.333 s\): T=1 s cave\.\$\.roughness = 46$/);
});

test("the no-op: rebuilt, nothing changed, revision kept, and no consumer sees a new revision", () => {
  const e = paramBuild({ trigger: { kind: "glue", call: null }, changed: false, key: { before: KEY_B, after: KEY_B }, revision: { before: 3, after: 3 }, record: [], kernels: { changed: [], added: [], removed: [], unchanged: ["cave.shade"] } });
  const text = formatBuild(e, { log: LOG });
  assert.match(text.split("\n")[0], /^build cave@3 after .*: rebuilt, nothing changed; revision kept$/);
  assert.match(text, /because: +glue edit \(the call was not recorded\)/);
  assert.match(text, /key: +sha256-uYokOU… unchanged/);
  assert.match(text, /consumers: +game\.in\.start, game\.in\.exit keep reading cave@3 \(no new revision\)/);
});

test("a failed rebuild says the previous revision keeps running, with its diagnostics", () => {
  const e = paramBuild({ ok: false, changed: false, key: { before: KEY_A, after: null }, revision: { before: 1, after: 1 }, record: [], diagnostics: [{ code: "N004", message: "part 'cave' init threw: boom" }] });
  const text = formatBuild(e, { log: LOG });
  assert.match(text.split("\n")[0], /^build cave FAILED after .*; cave@1 keeps running$/);
  assert.match(text, /diagnostics: +N004 part 'cave' init threw: boom/);
  assert.doesNotMatch(text, /consumers: .* see /);
});

test("package and kit triggers name the keys and the files", () => {
  const pkg = formatBuild(paramBuild({ trigger: { kind: "package", from: KEY_A, to: KEY_B, files: ["cave.js", "carve.js"] } }), {});
  assert.match(pkg, /because: +package changed sha256-Il\/pah… → sha256-uYokOU… \(files: cave\.js, carve\.js\)/);
  const kit = formatBuild(paramBuild({ trigger: { kind: "kit", from: "0.4.0", to: "0.5.0" } }), {});
  assert.match(kit, /because: +kit upgraded 0\.4\.0 → 0\.5\.0/);
  const glue = formatBuild(paramBuild({ trigger: { kind: "glue", call: "cave.grid" } }), {});
  assert.match(glue, /because: +glue edit of cave\.grid/);
});

test("the first boundary has no instant before it", () => {
  assert.match(formatBuild(paramBuild({ boundary: { after: null, before: "0" } }), {}).split("\n")[0], /^build cave@2 before the first instant, T=0 s$/);
});

test("why(part) lists that part's builds in order, with a heading that says how many and the revision now", () => {
  const second = paramBuild({ boundary: { after: "29/30", before: "1" }, revision: { before: 2, after: 3 }, trigger: { kind: "param", param: "roughness", from: 45, to: 46, reads: [] } });
  const other = paramBuild({ part: "game" });
  const text = why([paramBuild(), other, second], LOG, { part: "cave" });
  assert.equal(text.split("\n")[0], "why cave: 2 rebuilds in the run log; cave@3 now");
  assert.ok(text.indexOf("depth") < text.indexOf("roughness"));
  assert.doesNotMatch(text, /build game/);
});

test("why(part, since) keeps the builds at or after a time; a part never rebuilt says so", () => {
  const second = paramBuild({ boundary: { after: "29/30", before: "1" }, revision: { before: 2, after: 3 } });
  assert.doesNotMatch(why([paramBuild(), second], LOG, { part: "cave", since: "1/2" }), /build cave@2 /);
  assert.equal(why([], LOG, { part: "game" }), "why game: no rebuilds in the run log; game@1 since the run started");
});

test("without a base, read paths are shortened against the directory the builds' reads share", () => {
  const other = paramBuild({ boundary: { after: "29/30", before: "1" }, revision: { before: 2, after: 3 }, trigger: { kind: "param", param: "roughness", from: 45, to: 46, reads: [{ file: "file:///w/pkg/carve.js", line: 4, by: null }] } });
  const text = why([paramBuild(), other], LOG, { part: "cave" });
  assert.match(text, /read at build time at scenario\/glue\.js:12 \(before cave\.grid\)/);
  assert.match(text, /read at build time at pkg\/carve\.js:4$/m);
  assert.doesNotMatch(text, /file:\/\//);
  assert.match(why([paramBuild()], LOG, { part: "cave" }), /read at build time at glue\.js:12/);
  assert.match(why([paramBuild()], LOG, { part: "cave", base: "" }), /file:\/\/\/w\/scenario\/glue\.js:12/);
});

test("why() with no part covers every part's builds", () => {
  assert.match(why([paramBuild(), paramBuild({ part: "game" })], LOG), /^why: 2 rebuilds in the run log\n/);
});

/** Two changed rebuilds of the cave landing at one stamp, applied by log inputs 1 and 2. */
const pair = () => [
  paramBuild({ boundary: { after: "3/10", before: "1/3" }, input: 1, trigger: { kind: "glue", call: null } }),
  paramBuild({ boundary: { after: "3/10", before: "1/3" }, input: 2, revision: { before: 2, after: 3 }, key: { before: KEY_B, after: KEY_A }, trigger: { kind: "glue", call: null } }),
];
const PAIR_LOG = { inputs: [
  { kind: "control", T: "1/30", part: "game", name: "pad", value: { right: true } },
  { kind: "rebuild", T: "1/3", part: "cave", record: {} },
  { kind: "rebuild", T: "1/3", part: "cave", record: {} },
  { kind: "control", T: "1/2", part: "game", name: "pad", value: { right: false } },
] };

test("a build superseded at its own stamp says so, and the next names the revision consumers last read", () => {
  const text = why(pair(), PAIR_LOG, { part: "cave" });
  assert.match(text, /consumers: +game\.in\.start, game\.in\.exit never read cave@2: superseded by cave@3 before any consumer step/);
  assert.match(text, /read cave@1 at every step before T=1\/3 \(0\.333 s\), and cave@3 \(\$rev 3\) from their first step/);
});

test("each input is listed under exactly one build: the first applied at or after it, by log position", () => {
  const text = why(pair(), PAIR_LOG, { part: "cave" });
  const lines = text.split("\n").filter((l) => l.includes("inputs:"));
  assert.match(lines[0], /since the run started: T=1\/30 \(0\.033 s\) game pad right; T=1\/3 \(0\.333 s\) cave rebuild$/);
  assert.match(lines[1], /since T=1\/3 \(0\.333 s\): T=1\/3 \(0\.333 s\) cave rebuild$/);
});

test("two builds at different stamps say what consumers read between them without claiming a step", () => {
  const second = paramBuild({ boundary: { after: "3/10", before: "2/5" }, revision: { before: 2, after: 3 }, key: { before: KEY_B, after: KEY_A } });
  const text = why([paramBuild(), second], LOG, { part: "cave" });
  assert.match(text, /cave@2 \(\$rev 2\) at any step from T=1\/3 \(0\.333 s\) until cave@3 landed at T=2\/5 \(0\.4 s\)/);
  assert.match(text, /read cave@2 at every step from T=1\/3 \(0\.333 s\) until T=2\/5 \(0\.4 s\)/);
});

test("a boundary says it landed at its stamp, before the next instant, and the header counts since", () => {
  assert.match(formatBuild(paramBuild(), {}).split("\n")[0], /^build cave@2 after instant T=3\/10 \(0\.3 s\), at T=1\/3 \(0\.333 s\) \(before the next instant\)$/);
  assert.equal(why([paramBuild()], LOG, { part: "cave", since: "1/4" }).split("\n")[0], "why cave: 1 rebuild since T=1/4 (0.25 s); cave@2 now");
  assert.equal(why([paramBuild()], LOG, { since: "1/4" }).split("\n")[0], "why: 1 rebuild since T=1/4 (0.25 s)");
});
