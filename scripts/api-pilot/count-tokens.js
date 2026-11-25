// Counts the tokens in documentation files with Anthropic's count_tokens
// endpoint, one row per file plus their concatenation, for each named model.
// Usage: node scripts/api-pilot/count-tokens.js [--model id]... file...
// Needs ANTHROPIC_API_KEY in the environment (e.g. `set -a; . ./.env`).
import { readFile } from "node:fs/promises";

const DEFAULT_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
const ENDPOINT = "https://api.anthropic.com/v1/messages/count_tokens";
// A one-character message: the request's fixed overhead, subtracted from each count.
const BASELINE_TEXT = ".";

/** @param {string} model @param {string} text */
async function count(model, text) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: text }] }),
  });
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status} ${await response.text()}`);
  return /** @type {{input_tokens: number}} */ (await response.json()).input_tokens;
}

const args = process.argv.slice(2);
/** @type {string[]} */ const models = [];
/** @type {string[]} */ const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model") models.push(args[++i]);
  else files.push(args[i]);
}
if (files.length === 0 || !process.env.ANTHROPIC_API_KEY) {
  console.error("usage: node scripts/api-pilot/count-tokens.js [--model id]... file...  (needs ANTHROPIC_API_KEY)");
  process.exit(2);
}
const texts = await Promise.all(files.map((f) => readFile(f, "utf8")));
const rows = [...files.map((f, i) => [f, texts[i]]), ["(all, joined by a blank line)", texts.join("\n\n")]];

for (const model of models.length ? models : DEFAULT_MODELS) {
  const overhead = await count(model, BASELINE_TEXT) - 1;
  console.log(`${model} (request overhead ${overhead} subtracted)`);
  for (const [name, text] of rows) {
    console.log(`  ${String((await count(model, text)) - overhead).padStart(6)}  ${text.length.toString().padStart(6)} chars  ${name}`);
  }
}
