// The particles stage: one dot per live particle, in the state's box. A click reports the point clicked.
class ParticlesField extends HTMLElement {
  constructor() {
    super();
    this._state = undefined;
    this._params = undefined;
    this._text = undefined;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host { display: block; height: 100%; } canvas { display: block; width: 100%; height: 100%; }</style><canvas></canvas>`;
    this._canvas = root.querySelector("canvas");
    this._canvas.addEventListener("click", (e) => this._pick(e));
    this._resize = new ResizeObserver(() => this._draw());
  }

  // The host sets state last; a value set before this element upgraded is read here.
  set state(v) { this._state = v; this._draw(); }
  get state() { return this._state; }
  set params(v) { this._params = v; }
  get params() { return this._params; }
  set text(v) { this._text = v; }
  get text() { return this._text; }

  connectedCallback() {
    for (const k of ["state", "params", "text"]) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        delete this[k];
        this[k] = v;
      }
    }
    this._resize.observe(this);
    this._draw();
  }

  disconnectedCallback() {
    this._resize.unobserve(this);
  }

  _draw() {
    const s = this._state;
    const c = this._canvas;
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!s || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr * w / s.bounds.width, 0, 0, dpr * h / s.bounds.height, 0, 0);
    g.clearRect(0, 0, s.bounds.width, s.bounds.height);
    g.strokeStyle = "#888";
    g.strokeRect(0, 0, s.bounds.width, s.bounds.height);
    g.fillStyle = "#2a7ae2";
    for (const p of s.particles) {
      g.beginPath();
      g.arc(p.x, p.y, 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  _pick(e) {
    const s = this._state;
    if (!s) return;
    const r = this._canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * s.bounds.width;
    const y = ((e.clientY - r.top) / r.height) * s.bounds.height;
    this.dispatchEvent(new CustomEvent("wb-pick", { bubbles: true, composed: true, detail: { x, y } }));
  }
}

customElements.define("particles-field", ParticlesField);
