# Delivery decisions

*2026-11-23 · rulings from Ben in the first session, refining [the kit proposal](2026-11-23-workbench-kit-proposal.md)*

## The goal behind the kit

The aim is the tightest possible feedback loop for the user, at two levels: improving the domain language itself, and using it to try ideas quickly. Four things tighten it:

1. **Infrastructure:** the workbench HTML and its IR pipeline take a user-specified DSL to running code.
2. **Progressive disclosure for agents:** a short entry document, then the DSL reference, then the optional textbook. [`agents/cli-design.md`](agents/cli-design.md) ▸ Discoverability is the model, though this is not a CLI.
3. **Token efficiency:** less reading, searching, parsing, thinking and generating.
4. **Small models:** 1–3 together should let small local models use a finished workbench to make new apps quickly.

The user's flow on claude.ai is: paste a link → create a DSL → fill the workbench's slots (DSLs, files) → start the workbench → iterate on programs and on the DSL itself. The same flow must work locally, in Claude Code or OpenCode, and on other platforms.

## Rulings

- **Entry point is a GitHub repo link.** Its README carries an "if you're an agent and someone pasted this link" paragraph pointing at a playbook to fetch whole with `curl` from `raw.githubusercontent.com`, the pattern `bensyverson/bootstrap` uses. Whether the kit is this repo or a separate one is open; keep the kit self-contained in its own folder so it can be split out.
- **The wrapper HTML is fetched, not read.** The repo ships one or more prebuilt wrappers. The agent downloads a wrapper into its sandbox and publishes it unchanged beside the data files it wrote. It never reads the kit into context. (Rejected: a loader page that pulls the kit from a CDN.)
- **Storage is whatever is most Claude-native.** The DSL, book and configuration can be flat files. How to use the artifact `db` is the implementer's call.
  > **Settled by [M0](2026-11-23-m0-platform-probe.md):** the package is the artifact's own sibling files, and the page saves edits with `artifact.publish(files)`. `db` is an optional live channel between the chat and an open page.
- **Artifacts must survive download.** A user may start with an artifact and then download it to run locally. The downloaded form therefore has to work from `file://`, which in practice means one self-contained file.
- **In-page model access, in order:** Claude built in (the `sample` capability), then an Anthropic API key, then any OpenAI-compatible endpoint. On claude.ai only the first applies, because pages cannot fetch other hosts; opened locally, all three do.
- **No verbatim reuse of Ramon's or Manuel's prompts or HTML**, so there is no credit comment or reuse language, which keeps the kit business-friendly. The DMG Workbench serves only as a test oracle and a reference, read from `project/2026-11-23-dmg-workbench.html` by test scripts and never copied into the kit. The same holds for Manuel's [ds-js-os](https://github.com/wesen/2026-10-20--ds-js-os), Candela and CJI (2026-11-23, with Ben): take ideas, copy no code; they carry no license. See [passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md).
- **Owning a parser is deliberate.** The original prompts said "no parser or interpreter" because, without that line, large models wrote their own every time. The kit builds or sources one once so that no workbench recreates it, and owning it is what lets runtime lambdas lower to the IR.
- **Checks run in the browser as the baseline.** Every check must run inside an artifact page. Node is an extra for agents with a shell; the kit's code runs in both.
- **Defaults delegated to the implementer:** D1 (typed operators) stays open, with the parser kept easy to extend for it; M1's preset choice and comparison method are the implementer's.
- **Stack: JavaScript, type-checked by TypeScript.** The kit is plain JavaScript ES modules, checked with `tsc --noEmit` under `checkJs` and `strict`. Implementation files carry JSDoc annotations. Shared types such as the IR and the AST live in `.d.ts` files, imported with `/** @import … */`; they double as a compact, exact reference for agents. Tests use `node:test` on Node 26. `typescript` is the only dependency, dev-only and pinned.
  - **Why not TypeScript source**, which was briefly the ruling: the page is the baseline, and it can import the kit's sibling ES modules directly (M0). Plain JS means no build or type-stripping step on any path, and the single-file bundle only inlines. Workbench files (dialects, programs, helpers) must be JavaScript anyway, because the page runs them directly and the parser reads them through `String(fn)`. So everything that runs is what was written, in one language, with matching line numbers. The cost is wordier annotations in implementation files.
