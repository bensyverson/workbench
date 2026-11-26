#!/bin/sh
# Sets up one leg of a seams relay in a fresh directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/seams-trial/run.sh maze|particles <dir> <model>
#        scripts/seams-trial/run.sh compose <dir> <model> <maze-leg-dir> <particles-leg-dir>
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/<job>-seams/r1-maze)
#   <model>  a model id, e.g. claude-sonnet-5-5
#   a compose leg copies maze/ from <maze-leg-dir> and particles/ from <particles-leg-dir>, as those legs left them
# Writes <dir>/transcript.jsonl (the stream-json transcript) and <dir>/log.jsonl (one line per checker run).
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
# Canonicalize before the guard, as scripts/pkg-trial/run.sh does: resolve the part of the path that exists; the
# part that does not exist yet must not hold `.` or `..`. No directory is created until the guard has passed.
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
cp "$REPO/scripts/seams-trial/docs/seams.md" "$REPO/scripts/seams-trial/docs/rules.md" "$REPO/scripts/pkg-trial/docs/packaging.md" "$DIR/"
cp "$REPO/scripts/seams-trial/docs/task-$ROLE.md" "$DIR/task.md"
if [ "$ROLE" = compose ]; then
  cp -R "$MAZE_LEG/maze" "$PART_LEG/particles" "$DIR/"
  FOLDERS="two package folders, \`maze/\` and \`particles/\`"
  cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks workbench.js with maze/ and particles/; exits 1 on a violation.
SEAMS_TRIAL_LOG=$DIR/log.jsonl exec node $REPO/scripts/seams-trial/check.js $DIR --role compose "\$@"
EOF
else
  cp -R "$REPO/scripts/pkg-trial/fixtures/valid/$ROLE" "$DIR/$ROLE"
  FOLDERS="one package folder, \`$ROLE/\`"
  cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks the $ROLE package; exits 1 on a violation.
SEAMS_TRIAL_LOG=$DIR/log.jsonl exec node $REPO/scripts/seams-trial/check.js $DIR/$ROLE --role $ROLE "\$@"
EOF
  cat > "$DIR/hash.sh" <<EOF
#!/bin/sh
# Rewrites a package folder's wb-package.json "files" with every file's hash: ./hash.sh $ROLE
exec node $REPO/scripts/pkg/hash.js "\$@"
EOF
  chmod 755 "$DIR/hash.sh"
fi
chmod 755 "$DIR/check.sh"
# The brief is the text after the "---" line of brief.md, with <DIR> and <FOLDERS> filled in.
BRIEF=$(sed -n '/^---$/,$p' "$REPO/scripts/seams-trial/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g" | sed "s#<FOLDERS>#$FOLDERS#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
