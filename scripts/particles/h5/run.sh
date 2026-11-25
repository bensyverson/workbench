#!/bin/sh
# Sets up one H5 agent's directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/particles/h5/run.sh <dir> <model>
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/<job>-h5/agent-a)
#   <model>  a model id, e.g. claude-opus-5-5
# Writes <dir>/transcript.jsonl (the stream-json transcript) and <dir>/log.jsonl (one line per checker run).
set -eu
if [ $# -ne 2 ]; then echo "usage: run.sh <dir> <model>" >&2; exit 2; fi
DIR=$1
MODEL=$2
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
case "$DIR" in
  "$REPO"*|"$HOME/.claude"*) echo "run.sh: $DIR must be outside the repository and ~/.claude" >&2; exit 2 ;;
esac
if [ -e "$DIR" ]; then echo "run.sh: $DIR exists; give a fresh directory" >&2; exit 2; fi
mkdir -p "$DIR"
cp "$REPO/kit/START.md" "$REPO/kit/API.md" "$DIR/"
mkdir "$DIR/docs"
cp "$REPO"/kit/docs/*.md "$DIR/docs/"
cp "$REPO/scripts/particles/docs/dream-code.md" "$DIR/dream-code.md"
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
DEFINE_TRIAL_LOG=$DIR/log.jsonl exec node $REPO/scripts/define-trial/check.js $DIR --lang particles "\$@"
EOF
chmod 755 "$DIR/check.sh"
# The brief is the text after the "---" line of brief.md, with <DIR> filled in.
BRIEF=$(sed -n '/^---$/,$p' "$REPO/scripts/particles/h5/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
