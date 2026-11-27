#!/bin/sh
# Sets up one author leg of the tests dogfood (leaf mxxKTa) in a fresh directory and runs a fresh `claude -p` there,
# blind to the repository. The M4 trial's author leg (run.sh), with package tests required by the task:
#   - the docs are the kit's own, which hold the tests (package/README.md, START.md's step 6, API.md's "Testing it");
#   - task.md is the M4 task followed by tests-dogfood/task-tests-<role>.md (tests required, no harness outside the
#     manifest, a Tests section in REPORT.md);
#   - check.sh runs tests-dogfood/check.js: the M4 author check, which runs the manifest's tests on the real kit, plus
#     the trial's own T030 (no tests) and T031 (an Event input no test sends to), which are this trial's rules, not the kit's;
#   - the brief is brief.md's, plus a line on reading long documents by offset.
# Usage: scripts/m4-trial/run-tests-dogfood.sh game|score <dir> <model>
#   <dir>  a fresh directory outside the repository and outside ~/.claude (e.g. /private/tmp/mxxKTa-1)
# Writes <dir>/transcript.jsonl, <dir>/stderr.txt and <dir>/log.jsonl, as run.sh does.
set -eu
usage() { echo "usage: run-tests-dogfood.sh game|score <dir> <model>" >&2; exit 2; }
[ $# -eq 3 ] || usage
ROLE=$1
DIR=$2
MODEL=$3
case "$ROLE" in game|score) ;; *) usage ;; esac
REPO=$(cd "$(dirname "$0")/../.." && pwd -P)
case "$DIR" in
  /*) ;;
  *) echo "run-tests-dogfood.sh: $DIR is relative; give an absolute path" >&2; exit 2 ;;
esac
if [ -e "$DIR" ] || [ -L "$DIR" ]; then echo "run-tests-dogfood.sh: $DIR exists; give a fresh directory" >&2; exit 2; fi
ANC=${DIR%/}
TAIL=
while [ ! -d "$ANC" ]; do TAIL="/$(basename "$ANC")$TAIL"; ANC=$(dirname "$ANC"); done
case "$TAIL/" in
  */./*|*/../*) echo "run-tests-dogfood.sh: $DIR has a '.' or '..' in the part that does not exist yet" >&2; exit 2 ;;
esac
ANC=$(cd "$ANC" && pwd -P)
DIR="${ANC%/}$TAIL"
CLAUDE_HOME=$(cd "$HOME/.claude" 2>/dev/null && pwd -P || echo "$HOME/.claude")
case "$DIR/" in
  "$REPO"/*|"$CLAUDE_HOME"/*) echo "run-tests-dogfood.sh: $DIR must be outside the repository and ~/.claude" >&2; exit 2 ;;
esac
M4="$REPO/scripts/m4-trial"
TD="$M4/tests-dogfood"
mkdir -p "$DIR/docs/kit/docs" "$DIR/docs/project"
for f in START.md API.md define/README.md define/codes.js seam/README.md draw/README.md package/README.md compose/README.md run/README.md page/README.md; do
  mkdir -p "$DIR/docs/kit/$(dirname "$f")"
  cp "$REPO/kit/$f" "$DIR/docs/kit/$f"
done
cp "$REPO"/kit/docs/*.md "$DIR/docs/kit/docs/"
cp "$REPO/project/2026-11-25-package-format-draft.md" "$DIR/docs/project/"
cp "$M4/docs/rules.md" "$DIR/rules.md"
cat "$M4/docs/task-$ROLE.md" "$TD/task-tests-$ROLE.md" > "$DIR/task.md"
EXTRA=
[ "$ROLE" = game ] && { node "$M4/make-png.js" "$DIR/sprites.png" > /dev/null; EXTRA=", and \`sprites.png\`"; }
cat > "$DIR/check.sh" <<EOF
#!/bin/sh
# Checks your hand-in and runs its tests; exits 1 on a violation.
# Usage: ./check.sh <package folder>
M4_TRIAL_LOG=$DIR/log.jsonl exec node $TD/check.js --role $ROLE "\$@"
EOF
cat > "$DIR/hash.sh" <<EOF
#!/bin/sh
# Rewrites a package folder's wb-package.json "files" with every file's hash: ./hash.sh <folder>
exec node $REPO/scripts/pkg/hash.js "\$@"
EOF
chmod 755 "$DIR/check.sh" "$DIR/hash.sh"
BRIEF=$(sed -n '/^---$/,$p' "$M4/brief.md" | sed '1d' | sed "s#<DIR>#$DIR#g" | sed "s#<EXTRA>#$EXTRA#g")
BRIEF="$BRIEF

Read long documents (docs/kit/API.md and the READMEs are long) with your file-reading tool, a part at a time by offset, not with cat: output that long is cut off and saved outside your folder."
cd "$DIR"
exec claude -p "$BRIEF" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" \
  --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence \
  > "$DIR/transcript.jsonl" 2> "$DIR/stderr.txt"
