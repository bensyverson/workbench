#!/bin/sh
# Sets up one paper leg of the controls dogfood in a fresh folder outside the repository and runs a fresh `claude -p` there.
# Usage: scripts/controls-dogfood/run.sh game|synth|lens <dir> <model>
#   <dir>    a fresh absolute folder under /private/tmp named with the leaf id (e.g. /private/tmp/822dDs-synth); never under ~/.claude
#   <model>  sonnet or haiku (Ben's rule: never Opus)
# The folder gets task.md, rules.md and reference.md (built from the draft by build-reference.js). The brief is brief.md's text after
# its "---" line, with <DIR> filled in. Writes <dir>/transcript.jsonl (stream-json) and <dir>/stderr.txt.
set -eu
usage() { echo "usage: run.sh game|synth|lens <dir> <model>" >&2; exit 2; }
[ $# -eq 3 ] || usage
LEG=$1
DIR=$2
MODEL=$3
case "$LEG" in game|synth|lens) ;; *) usage ;; esac
case "$MODEL" in sonnet|haiku) ;; *) echo "run.sh: the model is sonnet or haiku" >&2; exit 2 ;; esac
case "$DIR" in /private/tmp/*) ;; *) echo "run.sh: $DIR must be under /private/tmp" >&2; exit 2 ;; esac
[ ! -e "$DIR" ] || { echo "run.sh: $DIR exists; give a fresh directory" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd -P)
mkdir -p "$DIR"
cp "$HERE/task-$LEG.md" "$DIR/task.md"
cp "$HERE/rules.md" "$DIR/rules.md"
node "$HERE/build-reference.js" > "$DIR/reference.md"
PROMPT=$(awk 'f{print} /^---$/{f=1}' "$HERE/brief.md" | sed "s|<DIR>|$DIR|g")
cd "$DIR"
exec claude -p "$PROMPT" --model "$MODEL" --output-format stream-json --verbose --permission-mode acceptEdits \
  --allowedTools "Bash Read Write Edit Glob Grep" --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config \
  --no-session-persistence > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
