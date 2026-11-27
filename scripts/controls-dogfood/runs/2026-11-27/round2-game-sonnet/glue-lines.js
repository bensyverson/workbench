// The reference gives no import path for compose or page, so the names are passed in.
// `score.out.picture` is a guess: the task does not name score's Draw output.
export default ({ compose, page, game, score }) =>
  compose("game-with-score")
    .part(game)
    .part(score)
    .wire(page.out.move, game.in.move)
    .wire(page.out.act, game.in.act)
    .wire(page.out.reset, score.in.reset)
    .show(game.out.board, score.out.picture);
