#!/bin/sh
# Sets up one UI trial agent's directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/ui-trial/run.sh <dir> <model>
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/<job>-ui/agent-a)
#   <model>  a model id, e.g. claude-opus-5-5
# Writes <dir>/transcript.jsonl (the stream-json transcript) and <dir>/log.jsonl (one line per checker run).
set -eu
if [ $# -ne 2 ]; then echo "usage: run.sh <dir> <model>" >&2; exit 2; fi
DIR=$1
MODEL=$2
REPO=$(cd "$(dirname "$0")/../.." && pwd -P)
case "$DIR" in
  /*) ;;
  *) echo "run.sh: $DIR is relative; give an absolute path" >&2; exit 2 ;;
esac
if [ -e "$DIR" ] || [ -L "$DIR" ]; then echo "run.sh: $DIR exists; give a fresh directory" >&2; exit 2; fi
# Canonicalize before the guard: resolve `..` and symlinks in the part of the path that exists (cd and pwd -P);
# the part that does not exist yet must not hold `.` or `..`. No directory is created until the guard has passed.
ANC=${DIR%/}
TAIL=
while [ ! -d "$ANC" ]; do TAIL="/$(basename "$ANC")$TAIL"; ANC=$(dirname "$ANC"); done
case "$TAIL/" in
  */./*|*/../*) echo "run.sh: $DIR has a '.' or '..' in the part that does not exist yet" >&2; exit 2 ;;
esac
ANC=$(cd "$ANC" && pwd -P)
DIR="${ANC%/}$TAIL"
CLAUDE_HOME=$(cd "$HOME/.claude" 2>/dev/null && pwd -P || echo "$HOME/.claude")
case "$DIR/" in
  "$REPO"/*|"$CLAUDE_HOME"/*) echo "run.sh: $DIR must be outside the repository and ~/.claude" >&2; exit 2 ;;
esac
mkdir -p "$DIR/particles/examples" "$DIR/maze/examples"
cp "$REPO/scripts/ui-trial/docs/ui-draft.md" "$REPO/scripts/ui-trial/docs/rules.md" "$REPO/scripts/ui-trial/docs/task.md" "$DIR/"
cp "$REPO/scripts/ui-trial/packages/given/particles.dialect.js" "$REPO/scripts/particles/reference/particles.grammar.js" "$DIR/particles/"
cp "$REPO/scripts/particles/reference/examples/01.js" "$DIR/particles/examples/01.js"
cp "$REPO/scripts/ui-trial/packages/given/maze.dialect.js" "$REPO/scripts/ui-trial/packages/maze/maze.grammar.js" "$DIR/maze/"
cp "$REPO/scripts/ui-trial/packages/maze/examples/01.js" "$DIR/maze/examples/01.js"
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks both packages' UI files; exits 1 if either has a violation.
S=0
UI_TRIAL_LOG=$DIR/log.jsonl node $REPO/scripts/ui-trial/check.js $DIR/particles --lang particles "\$@" || S=1
UI_TRIAL_LOG=$DIR/log.jsonl node $REPO/scripts/ui-trial/check.js $DIR/maze --lang maze "\$@" || S=1
exit \$S
EOF
chmod 755 "$DIR/check.sh"
# The brief is the text after the "---" line of brief.md, with <DIR> filled in.
BRIEF=$(sed -n '/^---$/,$p' "$REPO/scripts/ui-trial/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
