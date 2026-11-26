#!/bin/zsh
# Brings one finished blind leg into the record and scores its fix:
#   scripts/why-trial/collect.sh <tag> [<round>]
# Copies /private/tmp/HKNInI-<tag> (the agent's files) and its result JSON to runs/<round>/<tag>/ (round default
# 2026-11-26), writes its files back with the kit's paths under local/HKNInI-<tag>-back, and saves verify.js's
# output as verify.txt beside the hand-in.
setopt null_glob
set -u
tag=$1 round=${2:-2026-11-26}
here=${0:A:h}
src=/private/tmp/HKNInI-$tag
dst=$here/runs/$round/$tag
back=$here/../../local/HKNInI-$tag-back
mkdir -p $dst
cp $src/*.js $src/*.md $src/*.txt $src/*.json $dst/
if [[ -e $src.result.json ]]; then cp $src.result.json $dst/result.json; fi
node $here/packet.js back $src $back
node $here/verify.js $back > $dst/verify.txt 2>&1
echo "exit $?" >> $dst/verify.txt
cat $dst/verify.txt
