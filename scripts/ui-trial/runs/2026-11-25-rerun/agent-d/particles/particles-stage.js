// <particles-stage>: draws every live particle as a dot in the box; a click reports a wb-pick in state coordinates.
class ParticlesStage extends HTMLElement {
  constructor() {
    super();
    this._canvas = document.createElement("canvas");
    this._canvas.style.display = "block";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.addEventListener("click", (e) => this._click(e));
    this._resize = new ResizeObserver(() => this._draw());
  }
  connectedCallback() {
    if (!this._canvas.isConnected) this.appendChild(this._canvas);
    this._resize.observe(this);
    // The host may have set properties before the tag was defined: re-set them through the accessors.
    for (const k of ["params", "text", "state"]) {
      if (Object.prototype.hasOwnProperty.call(this, k)) { const v = this[k]; delete this[k]; this[k] = v; }
    }
    this._draw();
  }
  disconnectedCallback() { this._resize.disconnect(); }
  set params(v) { this._params = v; }
  get params() { return this._params; }
  set text(v) { this._text = v; }
  get text() { return this._text; }
  set state(v) { this._state = v; this._draw(); }
  get state() { return this._state; }
  _fit() {
    // The largest box with the state's aspect, centred in the element.
    const s = this._state, c = this._canvas;
    const k = Math.min(c.width / s.bounds.width, c.height / s.bounds.height);
    return { k, ox: (c.width - s.bounds.width * k) / 2, oy: (c.height - s.bounds.height * k) / 2 };
  }
  _draw() {
    const s = this._state, c = this._canvas;
    if (!s || !this.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.clientWidth * dpr)), h = Math.max(1, Math.round(this.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext("2d");
    const { k, ox, oy } = this._fit();
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#888";
    g.strokeRect(ox, oy, s.bounds.width * k, s.bounds.height * k);
    g.fillStyle = "#e60";
    const r = Math.max(1, 1.5 * k);
    for (const p of s.particles) {
      g.beginPath();
      g.arc(ox + p.x * k, oy + p.y * k, r, 0, 2 * Math.PI);
      g.fill();
    }
  }
  _click(e) {
    if (!this._state) return;
    const rect = this._canvas.getBoundingClientRect();
    const dpr = this._canvas.width / rect.width;
    const { k, ox, oy } = this._fit();
    const x = ((e.clientX - rect.left) * dpr - ox) / k, y = ((e.clientY - rect.top) * dpr - oy) / k;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}
customElements.define("particles-stage", ParticlesStage);
