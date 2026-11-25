// <particles-dots>: the particles stage. Draws every particle as a dot in the box; a click dispatches wb-pick with
// the point in state coordinates. Imports nothing; handles no keys; never calls focus().
class ParticlesDots extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = "<style>:host{display:block}canvas{display:block;width:100%;height:100%}</style><canvas></canvas>";
    this._canvas = root.querySelector("canvas");
    this._canvas.addEventListener("click", (e) => this._pick(e));
    this._ro = new ResizeObserver(() => this._draw());
  }
  connectedCallback() {
    // The host may have set properties before the tag was defined: take them over.
    for (const k of ["params", "text", "state"]) {
      if (Object.prototype.hasOwnProperty.call(this, k)) { const v = this[k]; delete this[k]; this[k] = v; }
    }
    this._ro.observe(this);
    this._draw();
  }
  disconnectedCallback() { this._ro.disconnect(); }
  set params(v) { this._params = v; }
  get params() { return this._params; }
  set text(v) { this._text = v; }
  get text() { return this._text; }
  set state(v) { this._state = v; this._draw(); }
  get state() { return this._state; }
  // The box's scale and offset: the bounds fitted into the element, aspect kept.
  _fit() {
    const s = this._state, w = this.clientWidth, h = this.clientHeight;
    const k = Math.min(w / s.bounds.width, h / s.bounds.height);
    return { k, ox: (w - s.bounds.width * k) / 2, oy: (h - s.bounds.height * k) / 2 };
  }
  _draw() {
    const s = this._state, c = this._canvas;
    if (!s || !this.isConnected) return;
    const dpr = window.devicePixelRatio || 1, w = this.clientWidth, h = this.clientHeight;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const { k, ox, oy } = this._fit();
    g.strokeStyle = "#888";
    g.strokeRect(ox, oy, s.bounds.width * k, s.bounds.height * k);
    g.fillStyle = "#e60";
    for (const p of s.particles) {
      g.beginPath(); g.arc(ox + p.x * k, oy + p.y * k, 1.5, 0, 2 * Math.PI); g.fill();
    }
  }
  _pick(e) {
    if (!this._state) return;
    const r = this.getBoundingClientRect(), { k, ox, oy } = this._fit();
    const x = (e.clientX - r.left - ox) / k, y = (e.clientY - r.top - oy) / k;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}
customElements.define("particles-dots", ParticlesDots);
