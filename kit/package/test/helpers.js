// Shared by the package tests: a valid file map, built with real hashes.
import { hashText } from "../index.js";

export const SRC = {
  "x.dialect.js": `import { defineDialect } from "kit/define";\nexport const xDialect = defineDialect({});\n`,
  "x.grammar.js": `import { defineGrammar } from "kit/define";\nimport { xDialect } from "./x.dialect.js";\nexport const x = defineGrammar(xDialect, {});\n`,
  "lib/noise.js": `export const noise = 1;\n`,
  "examples/01.js": `import { x } from "../x.grammar.js";\nexport default ($) => x("a");\n`,
};

/** A valid package's files, with the manifest's `files` hashed. @param {Record<string, unknown>} [over] manifest overrides @returns {Promise<Record<string, string>>} */
export async function validFiles(over = {}) {
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [p, t] of Object.entries(SRC)) hashes[p] = await hashText(t);
  const manifest = { name: "x", version: "0.1.0", kit: "0.4", entry: { dialect: "x.dialect.js", grammar: "x.grammar.js" }, lib: ["lib/noise.js"], examples: ["examples/01.js"], files: hashes, ...over };
  return { ...SRC, "wb-package.json": JSON.stringify(manifest, null, 2) };
}
