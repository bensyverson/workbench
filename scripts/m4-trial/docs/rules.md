# Rules

**R1. Your folder.** Work only in the folder this test gave you. Read only its files: `task.md`, this file, the kit's documentation under `docs/` (start at `docs/kit/START.md`) and, if you are the composer, the package folders it holds. A link in the documentation that points outside `docs/` is not there to read: if you needed it, say so under **Docs I could not reach**.

**R2. An author's hand-in.** One package folder in your folder, named by your Dialect's `name`, holding its `wb-package.json`, its Dialect, Grammar and runtime modules, the UI and data files your task asks for, and at least one example in the manifest's `examples`. Hash it with `./hash.sh <folder>` after every change to its files. `./check.sh` must exit 0.

**R3. The composer's hand-in.** `workbench.js` (the glue) in your folder, and any package of your own that it needs, as its own folder beside the two you were given. **Don't change the two packages you were given**, not even to rehash them: they are someone else's, and the checker compares them with what their authors handed in. If one lacks what you need, that is a finding: report it under **Gaps** and do what the packages let you. `./check.sh` must exit 0.

**R4. Imports.** A package's modules import only `"kit/define"` and the package's own files. The glue imports only `"kit/compose"`, `"kit/define"` and the packages by name.

**R5. No invented API.** Use only what the documentation says exists. When the kit cannot say something you need, do what it can, and list the need under **Gaps**: what you needed, and the smallest change that would let you say it.

**R6. REPORT.md**, in your folder, with these sections in this order:
1. **Difficulty**: 1 (easy) to 5 (could not finish), and one line on why.
2. **What I built**: a short description, and how a person uses it.
3. **Where the docs misled me**: each place a document said something that turned out wrong or that you read wrongly, with the file and what happened.
4. **What I guessed**: each decision the documents did not settle for you.
5. **APIs I fought**: each part of the kit that made you rewrite something, and why.
6. **Gaps**: per R5.
7. **Docs I could not reach**: per R1.
8. **Checker runs**: how many times you ran `./check.sh`, and the codes it gave you along the way.

**R7. Done** means `./check.sh` exits 0 and `REPORT.md` is written. Don't polish past that.
