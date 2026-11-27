# Your task: a grid game

Write, from scratch, a small **grid game** as a Dialect package of your own design: a language in which a Program declares one level of the game, and a runtime that plays it.

What the game must do:

- A Program declares a level: a grid of cells, some of them walls, some holding a gem, and where the player starts. How a Program writes that is your design.
- The **player** moves one cell at a time, steered by a person from the workbench page, and cannot walk into a wall. The page has no controls of its own: your package says how a person steers the player (by keys, by controls on the screen, or both), and a composer can wire what you declare to your game (`docs/kit/API.md`, "defineUI"; `docs/kit/compose/README.md`, "The page"). How the player moves while a person keeps steering (a step per press, or steps while held) is your design.
- Walking onto a gem **picks it up**. Other packages may want to know: offer each pickup as an Event output, and the number picked up as a value output.
- The game has a **picture**: a Draw output that draws the level and the player. The player (and the gems, if you like) are drawn from the image `sprites.png` in your folder: a 32-by-16 PNG of two 16-by-16 cells, cell 0 a figure (the player) and cell 1 a gem. Copy it into your package as a data file and declare it as an image.
- The package has a **UI** whose stage shows that picture (`stage: { draw: "<your Draw output>" }`).
- At least one example Program, a playable level.

Other packages, written by people you will never meet, may be composed with yours later. Declare your ports and frames so a stranger can use them from your Dialect alone, with a `note` on each.

**What `./check.sh` does** with your package folder (pass it the folder: `./check.sh <folder>`): loads it as the workbench page does (the manifest, the hashes, the imports, the modules, the data files), builds every example, then plays each example on the page with what your UI declares wired to your game, as the page wires a package played alone: a second with nothing touched, then each thing a person can press or change, in turn, for about a second each (on screen, or by the keys you declare). It fails if the picture is empty, if no image is drawn, if nothing your UI declares steers the game, or if playing it changed nothing in the picture, and on any diagnostic the kit or the page gives.
