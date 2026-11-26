#!/bin/zsh
# One blind leg of the why-text trial: a fresh folder under /private/tmp with the packet, and a `claude -p` run from
# there (so only the global CLAUDE.md loads), its JSON result saved beside the folder.
#   scripts/why-trial/run-blind.sh <arm: text|json> <model id> <tag> [<record dir> [--no-session]]
# The folder is /private/tmp/HKNInI-<tag> (it must not exist yet); the result is /private/tmp/HKNInI-<tag>.result.json.
# <record dir> defaults to runs/2026-11-26/record (round 1). Round 1 wrote result.json inside the folder, where the
# agents saw it, empty; collect.sh reads either place.
set -eu
arm=$1 model=$2 tag=$3
here=${0:A:h}
record=${4:-$here/runs/2026-11-26/record}
dir=/private/tmp/HKNInI-$tag
if [[ -e $dir ]]; then echo "$dir exists" >&2; exit 2; fi
node $here/packet.js out $dir --arm $arm --record $record ${5:-}
cd $dir
claude -p "$(cat TASK.md)" --model $model --output-format json --permission-mode acceptEdits \
  --allowedTools Read Edit Write Glob Grep "Bash(ls:*)" "Bash(cat:*)" > /private/tmp/HKNInI-$tag.result.json
echo "done $tag"
