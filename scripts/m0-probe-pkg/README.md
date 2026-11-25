# Package probe

Answers the [package format draft](../../project/2026-11-25-package-format-draft.md)'s question 5: can an artifact page load a Dialect package's modules as siblings, through an import map (static, and one added at run time), and from `blob:` URLs whose `./x.js` and `kit/define` imports are rewritten (the upload path)? Also checks SHA-256 hashing (the manifest's content hashes) and `DecompressionStream`.

- **Page:** `index.html` plus siblings `kit-define-stub.js`, `uses-bare.js`, `pkg/tiles/{lib,tiles.dialect}.js`.
- **Published** 2026-11-25 with capability `db` as https://claude.ai/artifact/JKj2gqGw6ixnYHknugiiWb (private to Ben). Republish the same files to update it.
- **Results:** open the page; it saves to the artifact database, collection `pkgprobe`, doc `results` (read with `ArtifactData get`). The upload row is manual: pick any folder of `.js` files.
- **Not yet run** in a browser as of 2026-11-25.
