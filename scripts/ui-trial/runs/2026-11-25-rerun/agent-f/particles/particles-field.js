// The particles stage: draws every particle as a dot in the box; a click reports the point clicked as a pick.
customElements.define("particles-field", class extends HTMLElement {
  constructor() {
    super();
    this._state = undefined;
    this._params = undefined;
    this._text = undefined;
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host { display: block; width: 100%; height: 100%; } canvas { display: block; width: 100%; height: 100%; }";
    this._canvas = document.createElement("canvas");
    root.append(style, this._canvas);
    this._canvas.addEventListener("click", (e) => this._pick(e));
    this._observer = new ResizeObserver(() => this._draw());
    // A property the host set before this module defined the tag is an own property; hand it to the setter.
    for (const k of ["state", "params", "text"]) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        delete this[k];
        this[k] = v;
      }
    }
  }

  connectedCallback() {
    this._observer.observe(this);
    this._draw();
  }

  disconnectedCallback() {
    this._observer.disconnect();
  }

  get state() { return this._state; }
  set state(v) { this._state = v; this._draw(); }

  get params() { return this._params; }
  set params(v) { this._params = v; }

  get text() { return this._text; }
  set text(v) { this._text = v; }

  _draw() {
    const s = this._state;
    const box = this.getBoundingClientRect();
    if (!s || box.width === 0 || box.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(box.width * dpr);
    this._canvas.height = Math.round(box.height * dpr);
    const g = this._canvas.getContext("2d");
    const sx = (box.width * dpr) / s.bounds.width;
    const sy = (box.height * dpr) / s.bounds.height;
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.clearRect(0, 0, s.bounds.width, s.bounds.height);
    g.fillStyle = "#111";
    g.fillRect(0, 0, s.bounds.width, s.bounds.height);
    g.fillStyle = "#9cf";
    for (const p of s.particles) {
      g.beginPath();
      g.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  _pick(e) {
    const s = this._state;
    if (!s) return;
    const r = this._canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * s.bounds.width;
    const y = ((e.clientY - r.top) / r.height) * s.bounds.height;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
});
