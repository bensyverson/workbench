#!/bin/sh
# Sets up one leg of the draw-list trial in a fresh directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/draw-trial/run.sh maze|particles <dir> <model>
#        scripts/draw-trial/run.sh compose <dir> <model> <maze-leg-dir> <particles-leg-dir>
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/e3qYus-maze)
#   <model>  a model id, e.g. claude-sonnet-5-5
#   an author leg starts from the seams relay's reference hand-in (scripts/seams-trial/fixtures/valid-2/<role>)
#   a compose leg copies maze/ from <maze-leg-dir> and particles/ from <particles-leg-dir>, as those legs left them,
#   and gets api.md (kit/API.md) to write its root package with
# Writes <dir>/transcript.jsonl (the stream-json transcript) and <dir>/log.jsonl (one line per checker run).
# The brief is brief.md's text after its "---" line. Adapted from scripts/seams-trial/run.sh (same guards).
set -eu
usage() { echo "usage: run.sh maze|particles <dir> <model> | run.sh compose <dir> <model> <maze-leg-dir> <particles-leg-dir>" >&2; exit 2; }
[ $# -ge 3 ] || usage
ROLE=$1
DIR=$2
MODEL=$3
case "$ROLE" in
  maze|particles) [ $# -eq 3 ] || usage ;;
  compose) [ $# -eq 5 ] || usage; MAZE_LEG=$4; PART_LEG=$5
    [ -f "$MAZE_LEG/maze/wb-package.json" ] || { echo "run.sh: $MAZE_LEG/maze is not a package" >&2; exit 2; }
    [ -f "$PART_LEG/particles/wb-package.json" ] || { echo "run.sh: $PART_LEG/particles is not a package" >&2; exit 2; } ;;
  *) usage ;;
esac
REPO=$(cd "$(dirname "$0")/../.." && pwd -P)
case "$DIR" in
  /*) ;;
  *) echo "run.sh: $DIR is relative; give an absolute path" >&2; exit 2 ;;
esac
if [ -e "$DIR" ] || [ -L "$DIR" ]; then echo "run.sh: $DIR exists; give a fresh directory" >&2; exit 2; fi
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
mkdir -p "$DIR"
SEAMS="$REPO/scripts/seams-trial/docs-placeholder"
DRAW="$REPO/scripts/draw-trial/docs"
cp "$SEAMS/seams.md" "$SEAMS/runtime.md" "$SEAMS/packaging.md" "$DRAW/draw.md" "$DRAW/rules.md" "$DIR/"
cp "$DRAW/task-$ROLE.md" "$DIR/task.md"
if [ "$ROLE" = compose ]; then
  cp -R "$MAZE_LEG/maze" "$PART_LEG/particles" "$DIR/"
  cp "$REPO/kit/API.md" "$DIR/api.md"
  FOLDERS="two package folders, \`maze/\` and \`particles/\`"
  EXTRA=", \`api.md\`"
  CHECKED="$DIR --role compose"
else
  cp -R "$REPO/scripts/seams-trial/fixtures/valid-2/$ROLE" "$DIR/$ROLE"
  FOLDERS="one package folder, \`$ROLE/\`"
  EXTRA=
  CHECKED="$DIR/$ROLE --role $ROLE"
fi
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks your hand-in; exits 1 on a violation.
DRAW_TRIAL_LOG=$DIR/log.jsonl exec node $REPO/scripts/draw-trial/check.js $CHECKED "\$@"
EOF
cat > "$DIR/hash.sh" <<EOF
#!/bin/sh
# Rewrites a package folder's wb-package.json "files" with every file's hash: ./hash.sh <folder>
exec node $REPO/scripts/pkg/hash.js "\$@"
EOF
chmod 755 "$DIR/check.sh" "$DIR/hash.sh"
BRIEF=$(sed -n '/^---$/,$p' "$REPO/scripts/draw-trial/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g" | sed "s#<FOLDERS>#$FOLDERS#g" | sed "s#<EXTRA>#$EXTRA#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
