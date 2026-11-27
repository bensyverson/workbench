// Checks a dogfood leg's hand-in by the draft's rules.
// Usage: node scripts/controls-dogfood/check.js <leg folder> <game|synth|lens>
// Reads <folder>/dialect.js (exports `ports`, `files`), <folder>/ui.js (exports `ui`) and, for the game leg,
// <folder>/glue-lines.js and <folder>/preset-lines.js as text; samples come from fixtures/<leg>.json.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { checkGlue, checkHandIn } from "./checks.js";

const [dir, leg] = process.argv.slice(2);
if (!dir || !leg) {
  console.error("usage: check.js <leg folder> <game|synth|lens>");
  process.exit(2);
}
const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(dir);
const fixture = JSON.parse(readFileSync(`${here}fixtures/${leg}.json`, "utf8"));
const dialect = await import(pathToFileURL(`${root}/dialect.js`).href);
const { ui } = await import(pathToFileURL(`${root}/ui.js`).href);
const problems = checkHandIn({ ports: dialect.ports, files: dialect.files, ui, sample: fixture.sample, gripItem: fixture.gripItem, validTargets: fixture.validTargets });
const names = Object.keys(ui.controls ?? {}).filter((n) => dialect.ports?.in?.[n]);
if (existsSync(`${root}/glue-lines.js`)) problems.push(...checkGlue(readFileSync(`${root}/glue-lines.js`, "utf8"), { controls: [...names, ...(fixture.otherControls ?? [])] }));
if (existsSync(`${root}/preset-lines.js`)) {
  const text = readFileSync(`${root}/preset-lines.js`, "utf8");
  if (!/examplePreset\(/.test(text)) problems.push({ code: "PRESET", where: "preset-lines.js", text: "no examplePreset call" });
  else if (!/\bui\b/.test(text)) problems.push({ code: "PRESET", where: "preset-lines.js", text: "examplePreset without `ui` wires nothing" });
  if (/\.wire\(/.test(text)) problems.push({ code: "PRESET", where: "preset-lines.js", text: "examplePreset wires by name: no explicit .wire is needed" });
}
for (const p of problems) console.log(`${p.code}  ${p.where}: ${p.text}`);
console.log(problems.length ? `${problems.length} problem(s)` : "ok: no problems by the draft's rules");
process.exit(problems.length ? 1 : 0);
