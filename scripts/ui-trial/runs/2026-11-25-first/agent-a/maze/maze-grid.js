// <maze-grid>: draws the grid, walls, coins and the player. Properties in: state, params, text. Imports nothing,
// dispatches nothing, handles no keys (the host owns the inputs).
class MazeGrid extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this.params = {};
    this.text = "";
    this._canvas = document.createElement("canvas");
    this.attachShadow({ mode: "open" }).appendChild(this._canvas);
  }
  set state(s) { this._state = s; this._draw(); }
  get state() { return this._state; }

  _draw() {
    const s = this._state;
    if (!s) return;
    const cell = 24;
    const w = Math.max(0, ...s.grid.map((r) => r.length));
    const c = this._canvas;
    c.width = w * cell;
    c.height = s.grid.length * cell;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    s.grid.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === "#") { g.fillStyle = "#444"; g.fillRect(x * cell, y * cell, cell, cell); }
        if (ch === "c") {
          g.fillStyle = "#d4a000";
          g.beginPath(); g.arc((x + 0.5) * cell, (y + 0.5) * cell, cell / 5, 0, 2 * Math.PI); g.fill();
        }
      });
    });
    g.fillStyle = "#06c";
    g.beginPath(); g.arc((s.player.x + 0.5) * cell, (s.player.y + 0.5) * cell, cell / 3, 0, 2 * Math.PI); g.fill();
  }
}
customElements.define("maze-grid", MazeGrid);
