# Vendored: acorn 8.19.0

A JavaScript parser (MIT; see `LICENSE`), copied unmodified from the npm package.

- **Version:** 8.19.0, the latest 8.x on 2026-11-25.
- **Source:** the npm tarball <https://registry.npmjs.org/acorn/-/acorn-8.19.0.tgz>
- **Tarball SHA-256:** `c6fad21ffa1f2ba20338bf1dde1de911c2093c1aaf7b3af17c477661bd3bfaaf`; its SSRI integrity matches the registry's `dist.integrity` (`sha512-oJlA3XiRm7Cyk6qFD2Jn8ak9B7jSy0qy00ADO3+8dpT0LSjFihQYv4C02LFCSYJV3Q37xYwwRy5m+IpIiUzqWw==`).
- **Copied on:** 2026-11-25.
- **Files** (from the tarball's `dist/` and root), with their SHA-256:
  - `acorn.mjs` (`dist/acorn.mjs`, the ESM build) `76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b`
  - `acorn.d.mts` (`dist/acorn.d.mts`, its types, so `tsc` reads the types and never checks the build) `df8107deaf41869871690db7306f87b587e59660d659b1fbb64a7a30cea7cf36`
  - `LICENSE` `76a876cf886ff9be2a8b5e2e86514fed06223c8c9f0c1e9ee9606e93841e00b7`

## Why it is here

`kit/package` checks a Dialect package's imports before any of its code runs. A lexical scan of JavaScript cannot be sound (the review of the package trial found several ways to hide an import from it), so the check parses. Ben approved vendoring a parser for this check (2026-11-25, recorded in `project/2026-11-25-package-trial-findings.md`). kit/parse's whole-file scan (`toplevel.js`) reads its trees too (Ben, 2026-11-25: it replaced a lexical scan that could not be made sound). It is not an npm dependency: the kit has none.

Only `kit/parse/module.js` imports it; `kit/package` and `kit/parse/toplevel.js` take their trees from there. It imports no Node built-in (`kit/package/test/vendor.test.js` checks this, since the browser-safe scan in `kit/test` reads `.js` files and this build is `.mjs`). `tsconfig.json` excludes `kit/vendor`.

## Updating

Fetch the new tarball with `npm pack acorn@<version>` in a scratch directory outside the repo, verify it against `npm view acorn@<version> dist.integrity`, copy the three files, and update every figure above (the vendor test fails until the hashes match).
