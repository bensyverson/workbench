// Summarizes H5 agent directories (run.sh's output): the model, tokens, turns, time, tool calls, every file
// or path the agent touched outside its own directory, checker runs and the first clean run.
// Usage: node scripts/particles/h5/summarize.js <dir>... [--json]
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

/** @typedef {{ type: string, subtype?: string, model?: string, cwd?: string, message?: { content?: unknown[] }, usage?: Record<string, number>, num_turns?: number, duration_ms?: number, total_cost_usd?: number, modelUsage?: Record<string, unknown>, result?: string }} Event */

/** @param {string} file @returns {any[]} */
function jsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/**
 * Paths a tool call names, whether each lies outside the agent's directory, and the files a Bash command reads.
 * A Bash command is listed whole; it is "outside" when, outside its heredoc bodies, it names an absolute path (or
 * `/` itself) not under the directory (system binaries aside), climbs out with `..`, or names `~` or `$HOME`. A
 * Glob or Grep is outside when its path, pattern or glob is. This is a text match, not a sandbox: a path built in
 * a variable or a `$(…)` is not seen, so "nothing outside" shows what the transcript names, not that the agent
 * stayed in.
 * @param {string} dir @param {string} name @param {Record<string, unknown>} input
 * @returns {{ what: string, outside: boolean, shellReads: string[] }}
 */
export function touch(dir, name, input) {
  const under = (/** @type {string} */ p) => { const r = resolve(dir, p); return r === dir || r.startsWith(`${dir}/`); };
  const home = (/** @type {string} */ p) => /^~|^\$\{?HOME\b/.test(p);
  /** A path or glob that is not under the directory; a glob is judged by its literal prefix. */
  const away = (/** @type {string} */ p) => home(p) || !under(p.replace(/[*?[{].*$/, ""));
  if (name === "Bash") {
    const cmd = String(input.command ?? "");
    const code = withoutHeredocBodies(cmd);
    // A path starts a word or follows a quote, `=`, `(`, `:`, `;`, `|`, `&`, `>` or a backtick (not `<`, as in `</canvas>`, not
    // `*` or `,`, as in a sed address or a case pattern) and ends at a word's end, a quote, a glob or an operator.
    const abs = code.match(/(?<=^|[\s"'=(:;|&>`])\/(?!\/)[\w.@+-][\w./@+-]*(?=[\s"'`;|&)<>$*?[{,]|$)|(?<=^|[\s"'=(:;|&>`])\/(?=[\s"';|&)]|$)/g) ?? [];
    const outside = abs.some((p) => !under(p) && !/^\/(dev\/(null|stdout|stderr)|(usr\/)?bin(\/|$))/.test(p))
      || /(^|[\s/"'=])\.\.(\/|\s|$|["'])/.test(code)
      || /\$\{?HOME\b|(^|[\s=:"'(])~([\w/]|\s|$)/.test(code);
    return { what: `Bash: ${cmd.length > 160 ? `${cmd.slice(0, 160)}…` : cmd}`, outside, shellReads: shellReads(code) };
  }
  const p = String(input.file_path ?? input.path ?? input.pattern ?? "");
  const where = name === "Glob" || name === "Grep" ? String(input.path ?? dir) : p;
  const patterns = [name === "Glob" ? input.pattern : undefined, name === "Grep" ? input.glob : undefined].filter((x) => typeof x === "string");
  const outside = home(where) || !under(where) || patterns.some((x) => isAbsolute(x) || home(x) ? away(x) : false);
  return { what: `${name}: ${p}${name === "Grep" && input.path ? ` in ${input.path}` : ""}`, outside, shellReads: [] };
}

/** The command with each heredoc's body removed (its `<<EOF` line stays), so file text is not read as paths. @param {string} cmd */
function withoutHeredocBodies(cmd) {
  return cmd.replace(/<<-?[ \t]*(["']?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, (m) => m.slice(0, m.indexOf("\n")));
}

/** Programs that print a file's text. */
const READERS = new Set(["cat", "head", "tail", "sed", "less", "more", "nl", "tac", "bat"]);

/**
 * The files `cat`, `head`, `tail`, `sed -n` and similar name in a command (heredoc bodies already removed): the
 * words of each pipeline stage after the program, less options, their numeric values, a sed script and redirects.
 * @param {string} code @returns {string[]}
 */
function shellReads(code) {
  /** @type {string[]} */
  const files = [];
  for (const stage of code.split(/\|\||&&|\||;|\n/)) {
    const words = (stage.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^(['"])(.*)\1$/, "$2"));
    const prog = words[0]?.replace(/^.*\//, "");
    if (!prog || !READERS.has(prog)) continue;
    let needScript = prog === "sed";
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (/^\d*[<>]/.test(w)) { if (/^\d*[<>]+$/.test(w)) i++; continue; }
      if (w === "-n" && (prog === "head" || prog === "tail")) { i++; continue; }
      if (w === "-e" || w === "-f") { needScript = false; i++; continue; }
      if (w.startsWith("-") || /^\+?\d+$/.test(w)) continue;
      if (needScript) { needScript = false; continue; }
      files.push(w);
    }
  }
  return files;
}

/** @param {string} dir */
export function summarize(dir) {
  dir = resolve(dir);
  /** @type {Event[]} */
  const events = jsonl(`${dir}/transcript.jsonl`);
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  // The agent's paths are judged against the directory it ran in (the init event's cwd), which differs from `dir`
  // when the run was copied (runs/<date>/agent-x/).
  const ran = typeof init?.cwd === "string" && init.cwd ? resolve(init.cwd) : dir;
  /** @type {{ what: string, outside: boolean, shellReads: string[] }[]} */
  const calls = [];
  for (const e of events) {
    if (e.type !== "assistant") continue;
    for (const c of /** @type {any[]} */ (e.message?.content ?? [])) if (c?.type === "tool_use") calls.push(touch(ran, c.name, c.input ?? {}));
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
    /** Files opened with the Read tool. Files read through the shell are in `shellReads`; neither is every file the agent saw (a Grep or `ls` shows content too). */
    reads: calls.filter((c) => c.what.startsWith("Read: ")).map((c) => c.what.slice(6)),
    shellReads: calls.flatMap((c) => c.shellReads),
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
    console.log(`  Read tool: ${s.reads.join(", ") || "nothing"}`);
    console.log(`  shell reads (cat, head, tail, sed -n): ${s.shellReads.join(", ") || "nothing"}`);
    console.log(`  outside its directory: ${s.outside.length ? `\n    ${s.outside.join("\n    ")}` : "nothing"}`);
  }
}
