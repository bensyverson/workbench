# The H5 run

H5 (M3, leaf `3Cd9hb`): fresh agents build the particles language from [kit/START.md](../../../kit/START.md) and [kit/API.md](../../../kit/API.md) alone, and the [hidden programs](../hidden/README.md) decide green. Each agent is a separate `claude -p` started in a fresh directory outside the repository, so it loads no `AGENTS.md` and no project memory (unlike a subagent, which inherits both: [project/gotchas.md](../../../project/gotchas.md)), and its stream-json transcript records every tool call, so the files it opened are measured rather than self-reported.

| Path | What |
|---|---|
| `brief.md` | the brief each agent got, word for word |
| `run.sh` | sets up one agent's directory (`START.md`, `API.md`, `dream-code.md`, `check.sh`) and runs `claude -p` there with the brief: Bash, Read, Write, Edit, Glob and Grep allowed; web, subagents and MCP servers off |
| `summarize.js` | per directory: model, turns, time, tokens, tool calls, every Read, every call that touched a path outside the directory, checker runs and the first clean run |
| `runs/<date>/agent-x/` | the record: each agent's definitions, examples, `REPORT.md`, `log.jsonl` and `transcript.jsonl` |

## Usage

```sh
scripts/particles/h5/run.sh /private/tmp/<job>-h5/agent-a claude-opus-5-5     # one agent; the directory must not exist
node scripts/particles/h5/summarize.js /private/tmp/<job>-h5/agent-*           # the run figures
node scripts/api-pilot/score.js /private/tmp/<job>-h5/agent-a scripts/particles/hidden --lang particles   # the hidden score
```

The directory must lie outside the repository and outside `~/.claude` (a blind run cannot write there: project/gotchas.md); `run.sh` refuses either. Its Bash runs unsandboxed, since `claude` and the checker need the home directory. The H5 score leaves out seven hidden rejects (r21b, r21c, r21s, r21u, r21l, r21n, r22l; [hidden/README.md](../hidden/README.md)): report the score over the rest, and those seven separately.

`summarize.js` flags a Bash command as outside when it names an absolute path not under the directory (system binaries aside), climbs out with `..`, or names `~`; it lists every Bash command it flags whole, so the reader judges. A path built some other way (a variable, `cd` then a relative path) is not caught: read the flagged list and skim the transcript's Bash calls.
