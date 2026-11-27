# Your task: a score and timer

Write, from scratch, a **score-and-timer** Dialect package of your own design: a language in which a Program declares one timed round, and a runtime that keeps its score.

What it must do:

- A Program declares a round: how long it lasts, in seconds, and whatever else your design needs (how much a point is worth, a target score, labels: your design).
- During the round, the score goes up each time it is **told something happened**: an Event input whose records each mean one scoring event. Which fields a record has, if any, is your design; a composer will wire some other package's events to it.
- Once the time is up the **round is over**: events no longer count, and the score stays as it was.
- Offer the score, the time left and whether the round is over as value outputs, so other packages can read them.
- It has a **picture**: a Draw output that shows the score and the time left (as text, and anything else you like). Keep it small: it will be drawn over someone else's picture.
- At least one example Program.

Other packages, written by people you will never meet, may be composed with yours later. Declare your ports and frames so a stranger can use them from your Dialect alone, with a `note` on each.

**What `./check.sh` does** with your package folder (pass it the folder: `./check.sh <folder>`): loads it as the workbench page does (the manifest, the hashes, the imports, the modules, the data files), builds every example, then runs each example alone on the page, with no events sent, for 65 seconds (so keep an example's round under a minute). It fails if the picture is ever empty, or does not change between the first and the third second while the time runs down, and on any diagnostic the kit or the page gives.
