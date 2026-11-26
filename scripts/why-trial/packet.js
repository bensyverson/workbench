// Makes a blind agent's folder for the why-text trial, and brings its fixed files back to run:
//   node scripts/why-trial/packet.js out <dir> --arm text|json --record <run-out-dir> [--no-session]
//   node scripts/why-trial/packet.js back <agent-dir> <scenario-dir>
// `out` copies the scenario's files with the kit imported by bare name (`kit/define`, `kit/compose`, `kit/run`),
// BUG.md, TASK.md (its host and evidence lines filled), and the evidence: why.txt (text arm) or builds.json and
// log.json (json arm), from a run-scenario.js record. --no-session leaves out session.js (the round-2 packet: the
// pad's timing is then only in the evidence), with BUG-nosession.md as BUG.md. `back` copies an agent's .js files
// into <scenario-dir> with the bare names pointed at this checkout's kit again, for verify.js and run-scenario.js.

import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const kit = resolve(here, "../../kit");
const FILES = ["cave.package.js", "game.package.js", "carve.js", "glue.js", "host.js", "session.js"];
const HOST = {
  session: "`host.js`, `session.js`: the host that runs the game, and the session the player played.",
  none: "`host.js`: the host that runs the game.",
};
const EVIDENCE = {
  text: "`why.txt`: the run's build log, explaining each rebuild of a part.",
  json: "`builds.json`, `log.json`: the run's build events and its input log, as JSON.",
};

const [cmd, a, b, ...rest] = process.argv.slice(2);
if (cmd === "out" && a) {
  const flags = [b, ...rest];
  /** @param {string} f */
  const flag = (f) => (flags.includes(f) ? flags[flags.indexOf(f) + 1] : undefined);
  const arm = /** @type {"text" | "json"} */ (flag("--arm") ?? "");
  const record = flag("--record");
  if (!(arm in EVIDENCE) || !record) usage();
  const session = !flags.includes("--no-session");
  mkdirSync(a, { recursive: true });
  for (const f of FILES.filter((x) => session || x !== "session.js")) {
    const text = readFileSync(join(here, "scenario", f), "utf8").replace(/"\.\.\/\.\.\/\.\.\/kit\/(define|compose|run)\/index\.js"/g, '"kit/$1"').replace(/^\/\/ @ts-nocheck.*$/m, "");
    writeFileSync(join(a, f), text);
  }
  copyFileSync(join(here, "packet", session ? "BUG.md" : "BUG-nosession.md"), join(a, "BUG.md"));
  const task = readFileSync(join(here, "packet", "TASK.md"), "utf8").replace("{{HOST}}", HOST[session ? "session" : "none"]).replace("{{EVIDENCE}}", EVIDENCE[arm]);
  writeFileSync(join(a, "TASK.md"), task);
  for (const f of arm === "text" ? ["why.txt"] : ["builds.json", "log.json"]) copyFileSync(join(record, f), join(a, f));
  console.log(`wrote ${a} (${arm} arm${session ? "" : ", no session"})`);
} else if (cmd === "back" && a && b) {
  mkdirSync(b, { recursive: true });
  for (const f of readdirSync(a).filter((x) => x.endsWith(".js"))) {
    const text = readFileSync(join(a, f), "utf8").replace(/"kit\/(define|compose|run)"/g, (_m, m) => JSON.stringify(join(kit, m, "index.js")));
    writeFileSync(join(b, f), text);
  }
  console.log(`wrote ${b}`);
} else usage();

/** @returns {never} */
function usage() {
  console.error("usage: packet.js out <dir> --arm text|json --record <run-out-dir> [--no-session] | packet.js back <agent-dir> <scenario-dir>");
  process.exit(2);
}
