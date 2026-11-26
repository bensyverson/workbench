#!/bin/sh
# Sets up one package trial agent's directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/pkg-trial/run.sh <dir> <model>
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/<job>-pkg/agent-a)
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
mkdir -p "$DIR/particles/examples" "$DIR/maze/examples" "$DIR/out"
cp "$REPO/scripts/pkg-trial/docs/packaging.md" "$REPO/scripts/pkg-trial/docs/rules.md" "$REPO/scripts/pkg-trial/docs/task.md" "$DIR/"
# The raw materials are laid out loose, not as packages: making them packages is the task.
cp "$REPO/scripts/particles/reference/particles.dialect.js" "$REPO/scripts/particles/reference/particles.grammar.js" "$DIR/particles/"
cp "$REPO/scripts/particles/reference/examples/"* "$DIR/particles/examples/"
cp "$REPO/scripts/ui-trial/fixtures/valid/particles.ui.js" "$REPO/scripts/ui-trial/fixtures/valid/particles-field.js" "$DIR/particles/"
cp "$REPO/scripts/ui-trial/packages/maze/maze.dialect.js" "$REPO/scripts/ui-trial/packages/maze/maze.grammar.js" "$DIR/maze/"
cp "$REPO/scripts/ui-trial/packages/maze/examples/"* "$DIR/maze/examples/"
cp "$REPO/scripts/ui-trial/fixtures/valid/maze.ui.js" "$DIR/maze/"
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks both packages in out/; exits 1 if either has a violation.
S=0
PKG_TRIAL_LOG=$DIR/log.jsonl node $REPO/scripts/pkg-trial/check.js $DIR/out/particles "\$@" || S=1
PKG_TRIAL_LOG=$DIR/log.jsonl node $REPO/scripts/pkg-trial/check.js $DIR/out/maze "\$@" || S=1
exit \$S
EOF
chmod 755 "$DIR/check.sh"
cat > "$DIR/hash.sh" <<EOF
#!/bin/sh
# Rewrites a package folder's wb-package.json "files" with every file's hash: ./hash.sh out/particles
exec node $REPO/scripts/pkg/hash.js "\$@"
EOF
chmod 755 "$DIR/hash.sh"
# The brief is the text after the "---" line of brief.md, with <DIR> filled in.
BRIEF=$(sed -n '/^---$/,$p' "$REPO/scripts/pkg-trial/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
