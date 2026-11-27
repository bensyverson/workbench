// node scripts/m4-trial/tests-dogfood/scan.js <leg dir>: lists a blind leg's Bash commands, Writes and any tool input naming a path outside its folder.
import { readFileSync } from "node:fs";
const dir = process.argv[2];
for (const line of readFileSync(`${dir}/transcript.jsonl`, "utf8").split("\n")) {
  if (!line) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  for (const c of e.message?.content ?? []) {
    if (c.type !== "tool_use") continue;
    const s = JSON.stringify(c.input);
    if (c.name === "Bash") console.log("BASH", c.input.command.slice(0, 200).replace(/\n/g, " | "));
    else if (c.name === "Write") console.log("WRITE", c.input.file_path);
    const outside = (s.match(/\/(Users|private|tmp|var)\/[^"\s]*/g) ?? []).filter((p) => !p.startsWith(dir) && !p.startsWith(dir.replace("/private", "")));
    if (outside.length) console.log("OUTSIDE", c.name, outside.join(" "));
  }
}
