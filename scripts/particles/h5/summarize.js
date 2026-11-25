// Summarizes H5 agent directories (run.sh's output): the model, tokens, turns, time, tool calls, every file
// or path the agent touched outside its own directory, checker runs and the first clean run.
// Usage: node scripts/particles/h5/summarize.js <dir>... [--json]
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** @typedef {{ type: string, subtype?: string, model?: string, message?: { content?: unknown[] }, usage?: Record<string, number>, num_turns?: number, duration_ms?: number, total_cost_usd?: number, modelUsage?: Record<string, unknown>, result?: string }} Event */

/** @param {string} file @returns {any[]} */
function jsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/**
 * Paths a tool call names, and whether each lies outside the agent's directory.
 * A Bash command is listed whole; it is "outside" when it names an absolute path not under the directory
 * (system binaries aside), climbs out with `..`, or names `~`.
 * @param {string} dir @param {string} name @param {Record<string, unknown>} input
 * @returns {{ what: string, outside: boolean }}
 */
export function touch(dir, name, input) {
  const under = (/** @type {string} */ p) => { const r = resolve(dir, p); return r === dir || r.startsWith(`${dir}/`); };
  if (name === "Bash") {
    const cmd = String(input.command ?? "");
    const abs = cmd.match(/(?<![\w.])\/[\w./-]+/g) ?? [];
    const outside = abs.some((p) => !under(p) && !/^\/(dev\/null|bin\/|usr\/bin\/)/.test(p)) || /(^|[\s/])\.\.(\/|\s|$)|~/.test(cmd);
    return { what: `Bash: ${cmd.length > 160 ? `${cmd.slice(0, 160)}…` : cmd}`, outside };
  }
  const p = String(input.file_path ?? input.path ?? input.pattern ?? "");
  const where = name === "Glob" || name === "Grep" ? String(input.path ?? dir) : p;
  return { what: `${name}: ${p}${name === "Grep" && input.path ? ` in ${input.path}` : ""}`, outside: !under(where) };
}

/** @param {string} dir */
export function summarize(dir) {
  dir = resolve(dir);
  /** @type {Event[]} */
  const events = jsonl(`${dir}/transcript.jsonl`);
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  /** @type {{ what: string, outside: boolean }[]} */
  const calls = [];
  for (const e of events) {
    if (e.type !== "assistant") continue;
    for (const c of /** @type {any[]} */ (e.message?.content ?? [])) if (c?.type === "tool_use") calls.push(touch(dir, c.name, c.input ?? {}));
  }
  const runs = jsonl(`${dir}/log.jsonl`);
  const firstClean = runs.findIndex((r) => r.ok === true);
  const u = result?.usage ?? {};
  return {
    dir,
    model: init?.model ?? null,
    finished: result ? result.subtype : "no result event",
    turns: result?.num_turns ?? null,
    seconds: result?.duration_ms !== undefined ? Math.round(result.duration_ms / 1000) : null,
    costUsd: result?.total_cost_usd ?? null,
    tokens: { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
    toolCalls: calls.length,
    outside: calls.filter((c) => c.outside).map((c) => c.what),
    reads: calls.filter((c) => c.what.startsWith("Read: ")).map((c) => c.what.slice(6)),
    checkerRuns: runs.length,
    firstClean: firstClean < 0 ? null : firstClean + 1,
    lastOk: runs.length ? runs[runs.length - 1].ok === true : null,
    reply: result?.result ?? null,
  };
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = args.includes("--json");
  const dirs = args.filter((a) => a !== "--json");
  if (!dirs.length) { console.error("usage: summarize.js <dir>... [--json]"); process.exit(2); }
  const all = dirs.map(summarize);
  if (json) console.log(JSON.stringify(all, null, 2));
  else for (const s of all) {
    const t = s.tokens;
    console.log(`${s.dir}\n  model ${s.model}, ${s.finished}, ${s.turns} turns, ${s.seconds} s, $${s.costUsd?.toFixed(2)}`);
    console.log(`  tokens: input ${t.input}, cache write ${t.cacheWrite}, cache read ${t.cacheRead}, output ${t.output}`);
    console.log(`  tool calls ${s.toolCalls}; checker runs ${s.checkerRuns}, first clean ${s.firstClean ?? "never"}, last ${s.lastOk ? "clean" : "not clean"}`);
    console.log(`  read: ${s.reads.join(", ") || "nothing"}`);
    console.log(`  outside its directory: ${s.outside.length ? `\n    ${s.outside.join("\n    ")}` : "nothing"}`);
  }
}
