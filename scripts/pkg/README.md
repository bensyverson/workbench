# scripts/pkg: package tools

Thin command-line tools over [kit/package](../../kit/package/README.md): the first writes a package's hashes, the second packs a package into one bundle file. Both take a package folder and ignore dotfiles (any path part starting with `.`, which is never part of a package; `checkPackage` ignores them too). The folder reader and `hashDir` are in `dir.js`, which the trial checker and tests also use.

```sh
node scripts/pkg/hash.js <dir>                 # rewrite <dir>/wb-package.json's "files": every file under <dir> but the manifest, sorted, each with its sha256-<base64>
node scripts/pkg/bundle.js <dir> > tiles.wb.json   # one JSON file: { "format": "wb-bundle", "files": { path: text } }, manifest included
```

`hash.js` keeps every other manifest field as written, and prints how many files it hashed; run it after any change to a package's files. Run it before `bundle.js` so the bundle's manifest is current. A bundle is read in the page by `readBundle` as the same `{ path: text }` map a set of picked files makes.

Exit codes (the house table): 0 done; 2 a bad invocation (`--help` prints the usage and exits 0); 4 the folder is missing, or the manifest is missing or not JSON (a bad manifest is left untouched). Checking a package is [scripts/pkg-trial/check.js](../pkg-trial/README.md). Tests: `test/pkg.test.js` drives both binaries on a temp folder.
