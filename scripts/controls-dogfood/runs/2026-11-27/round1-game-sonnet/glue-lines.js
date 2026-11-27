// Only the .wire(...) calls and the .show(...) line. `composition` is
// compose("<name>") with the `game` and `score` parts already added.
// score's picture is NOT shown: the reference documents .show with one output
// only (see REPORT.md, Gaps).
export default (composition, { page, game, score }) =>
  composition
    .wire(page.out.play, game.in.play)
    .wire(page.out.reset, score.in.reset)
    .show(game.out.board);
