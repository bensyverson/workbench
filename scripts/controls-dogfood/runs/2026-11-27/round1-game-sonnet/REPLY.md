**Difficulty: 2 out of 5.** The hardest part was the line that has to show both parts' pictures. The reference only documents `.show(<part>.out.<output>)` with one output, and the task never names `score`'s Draw output. Rather than invent a form, I wrote `.show(game.out.board)` only, so **`score`'s picture is not shown and that requirement is unmet**. Screen placement was the next hardest: I couldn't find a documented way to put two Controls side by side, so the pad and both buttons are one `buttons` Control, `play`, positioned with `grid`.

All the files and `REPORT.md` are written. The four modules import under Node, and the preset and glue functions make the expected calls against stand-in objects. Nothing is checked against the kit, because there's nothing to run. I read only `task.md`, `rules.md` and `reference.md`; I didn't open `stderr.txt` or `transcript.jsonl`, which were also in the folder.

(Saved by the integrator from the transcript's final message.)
