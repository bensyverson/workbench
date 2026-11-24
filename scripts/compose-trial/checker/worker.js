// The child process of an isolated check (isolated.js): `node worker.js <dir> <result file>`. It runs
// checkDir and writes the outcome as JSON to the result file, then exits. A candidate that ends this process
// first (process.exit, an unsettled top-level await) leaves no result file, which the parent reports.
// Unhandled rejections and uncaught exceptions the candidate raises, even after the build, are collected as
// C005 instead of crashing the check after it reported "no violations".

import { writeFileSync } from "node:fs";
import { checkDir, CheckTargetError } from "./index.js";
import { session, candidateFrame } from "./session.js";

const [dir, resultFile] = process.argv.slice(2);

/** @type {unknown[]} */
const raised = [];
process.on("unhandledRejection", (e) => { raised.push(e); });
process.on("uncaughtException", (e) => { raised.push(e); });

/** @type {Record<string, unknown>} */
let payload;
try {
  const result = await checkDir(dir);
  // A rejection or timer the candidate left behind surfaces within a few turns of the event loop.
  await new Promise((r) => setTimeout(r, 100));
  for (const e of raised) {
    const err = e instanceof Error ? e : new Error(String(e));
    const site = candidateFrame(err.stack ?? "") ?? { file: "program.js", line: 1 };
    session.add("C005", site, `${site.file}: an unhandled rejection or uncaught exception, ${err.name}: ${err.message.split("\n")[0]}`, "the file must run top to bottom at build time and leave no promise or timer that fails later");
  }
  const diagnostics = raised.length ? [...session.diagnostics].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) : result.diagnostics;
  payload = { result: { ...result, diagnostics, ok: !diagnostics.some((d) => d.severity === "error") } };
} catch (e) {
  payload = e instanceof CheckTargetError ? { target: e.message } : { crash: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
}
writeFileSync(resultFile, JSON.stringify(payload));
process.exit(0);
