// particles-field: draws every particle as a dot in the box. A click reports the point clicked, in state
// coordinates, as wb-pick. Receives the properties state, params and text; imports nothing.
class ParticlesField extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._params = null;
    this._text = "";
    this._canvas = document.createElement("canvas");
    const root = this.attachShadow({ mode: "open" });
    root.appendChild(this._canvas);
    this._canvas.addEventListener("click", (e) => this._pick(e));
  }

  set state(value) {
    this._state = value;
    this._draw();
  }

  get state() {
    return this._state;
  }

  set params(value) {
    this._params = value;
  }

  get params() {
    return this._params;
  }

  set text(value) {
    this._text = value;
  }

  get text() {
    return this._text;
  }

  _draw() {
    const s = this._state;
    if (!s) return;
    const c = this._canvas;
    if (c.width !== s.bounds.width) c.width = s.bounds.width;
    if (c.height !== s.bounds.height) c.height = s.bounds.height;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#333";
    for (const p of s.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _pick(e) {
    const s = this._state;
    if (!s) return;
    const r = this._canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * this._canvas.width) / r.width;
    const y = ((e.clientY - r.top) * this._canvas.height) / r.height;
    this.dispatchEvent(new CustomEvent("wb-pick", { bubbles: true, composed: true, detail: { x, y } }));
  }
}

if (!customElements.get("particles-field")) {
  customElements.define("particles-field", ParticlesField);
}
