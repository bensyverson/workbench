// <particles-field>: draws every live particle as a dot in the box; a click dispatches wb-pick in state coordinates.
// Properties in (set by the host after every tick): state, params, text. Imports nothing.
class ParticlesField extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this.params = {};
    this.text = "";
    const root = this.attachShadow({ mode: "open" });
    this._canvas = document.createElement("canvas");
    this._canvas.width = 400;
    this._canvas.height = 300;
    this._canvas.style.width = "100%";
    root.appendChild(this._canvas);
    this._canvas.addEventListener("click", (e) => this._onClick(e));
  }
  set state(s) { this._state = s; this._draw(); }
  get state() { return this._state; }

  _draw() {
    const s = this._state;
    if (!s) return;
    const c = this._canvas;
    c.width = s.bounds.width;
    c.height = s.bounds.height;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    g.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    for (const p of s.particles) {
      g.beginPath();
      g.arc(p.x, p.y, 1.5, 0, 2 * Math.PI);
      g.fill();
    }
  }

  _onClick(e) {
    const s = this._state;
    if (!s) return;
    const r = this._canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * s.bounds.width;
    const y = ((e.clientY - r.top) / r.height) * s.bounds.height;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}
customElements.define("particles-field", ParticlesField);
