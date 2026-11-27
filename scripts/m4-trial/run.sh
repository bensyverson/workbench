#!/bin/sh
# Sets up one leg of the M4 trial in a fresh directory and runs a fresh `claude -p` there, blind to the repository.
# Usage: scripts/m4-trial/run.sh game|score <dir> <model>
#        scripts/m4-trial/run.sh compose <dir> <model> <game-leg-dir> <score-leg-dir>
#        scripts/m4-trial/run.sh layer <dir> <model> <game-leg-dir> <score-leg-dir>   (the layer dogfood, leaf teBNYM)
#   <dir>    a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/IhJ35P-game)
#   <model>  a model id or alias, e.g. sonnet
#   every leg gets task.md, rules.md and the kit's author documentation under docs/ (kit/START.md, kit/API.md and the
#   pages they point an author to, and the package format draft), laid out as in the repository so relative links hold;
#   the game leg also gets sprites.png (make-png.js); a compose leg copies the one package folder of each author leg,
#   as that leg left it; a layer leg is a compose leg on the layer draft: task-layer.md, its docs edited by layer-docs.js,
#   and check.sh running the layer leg's checker (--role layer, on the real kit since layer-build, leaf pQKgWN)
# Writes <dir>/transcript.jsonl (the stream-json transcript), <dir>/stderr.txt and <dir>/log.jsonl (one line per
# checker run). The brief is brief.md's text after its "---" line. Adapted from scripts/draw-trial/run.sh (same guards).
set -eu
usage() { echo "usage: run.sh game|score <dir> <model> | run.sh compose|layer <dir> <model> <game-leg-dir> <score-leg-dir>" >&2; exit 2; }
[ $# -ge 3 ] || usage
ROLE=$1
DIR=$2
MODEL=$3
REPO=$(cd "$(dirname "$0")/../.." && pwd -P)
onepkg() { # the one package folder of a leg directory
  n=0; found=
  for m in "$1"/*/wb-package.json; do [ -f "$m" ] || continue; n=$((n + 1)); found=$(dirname "$m"); done
  [ "$n" -eq 1 ] || { echo "run.sh: $1 holds $n package folders, not one" >&2; exit 2; }
  echo "$found"
}
case "$ROLE" in
  game|score) [ $# -eq 3 ] || usage ;;
  compose|layer) [ $# -eq 5 ] || usage; GAME_PKG=$(onepkg "$4"); SCORE_PKG=$(onepkg "$5") ;;
  *) usage ;;
esac
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
mkdir -p "$DIR/docs/kit/docs" "$DIR/docs/project"
for f in START.md API.md define/README.md define/codes.js seam/README.md draw/README.md package/README.md compose/README.md run/README.md page/README.md; do
  mkdir -p "$DIR/docs/kit/$(dirname "$f")"
  cp "$REPO/kit/$f" "$DIR/docs/kit/$f"
done
cp "$REPO"/kit/docs/*.md "$DIR/docs/kit/docs/"
cp "$REPO/project/2026-11-25-package-format-draft.md" "$DIR/docs/project/"
[ "$ROLE" = layer ] && node "$REPO/scripts/m4-trial/layer-docs.js" "$DIR/docs/kit"
M4="$REPO/scripts/m4-trial"
cp "$M4/docs/rules.md" "$DIR/rules.md"
cp "$M4/docs/task-$ROLE.md" "$DIR/task.md"
if [ "$ROLE" = compose ] || [ "$ROLE" = layer ]; then
  cp -R "$GAME_PKG" "$SCORE_PKG" "$DIR/"
  EXTRA=", and two package folders, \`$(basename "$GAME_PKG")/\` (the grid game) and \`$(basename "$SCORE_PKG")/\` (the score and timer)"
  CHECK="$DIR --role $ROLE --given $GAME_PKG --given $SCORE_PKG"
else
  EXTRA=
  [ "$ROLE" = game ] && { node "$M4/make-png.js" "$DIR/sprites.png" > /dev/null; EXTRA=", and \`sprites.png\`"; }
  CHECK="--role $ROLE"
fi
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks your hand-in; exits 1 on a violation.$( [ "$ROLE" = compose ] || [ "$ROLE" = layer ] || printf '\n# Usage: ./check.sh <package folder>' )
M4_TRIAL_LOG=$DIR/log.jsonl exec node $M4/check.js $CHECK "\$@"
EOF
cat > "$DIR/hash.sh" <<EOF
#!/bin/sh
# Rewrites a package folder's wb-package.json "files" with every file's hash: ./hash.sh <folder>
exec node $REPO/scripts/pkg/hash.js "\$@"
EOF
chmod 755 "$DIR/check.sh" "$DIR/hash.sh"
BRIEF=$(sed -n '/^---$/,$p' "$M4/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g" | sed "s#<EXTRA>#$EXTRA#g")
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
