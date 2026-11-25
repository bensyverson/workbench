// Draws every particle as a dot in the box; a click inside the box dispatches wb-pick in state coordinates.
class ParticlesDots extends HTMLElement {
  #state;
  #canvas;
  #observer;
  #view = null; // { left, top, scale } of the box inside the canvas, in CSS pixels

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =
      ":host{display:block;position:relative;width:100%;height:100%;overflow:hidden}" +
      "canvas{position:absolute;inset:0;width:100%;height:100%}";
    this.#canvas = document.createElement("canvas");
    root.append(style, this.#canvas);
    this.#canvas.addEventListener("click", (event) => this.#pick(event));
  }

  connectedCallback() {
    // A state set before the tag was defined sits as an own property that hides the setter.
    if (Object.hasOwn(this, "state")) {
      const early = this.state;
      delete this.state;
      this.state = early;
    }
    this.#observer = new ResizeObserver(() => this.#draw());
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  get state() {
    return this.#state;
  }

  set state(value) {
    this.#state = value;
    this.#draw();
  }

  #draw() {
    const state = this.#state;
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (!state || width === 0 || height === 0) return;

    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.#canvas.width !== pixelWidth || this.#canvas.height !== pixelHeight) {
      this.#canvas.width = pixelWidth;
      this.#canvas.height = pixelHeight;
    }

    const { bounds, particles } = state;
    const scale = Math.min(width / bounds.width, height / bounds.height);
    const left = (width - bounds.width * scale) / 2;
    const top = (height - bounds.height * scale) / 2;
    this.#view = { left, top, scale };

    const g = this.#canvas.getContext("2d");
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);
    g.strokeStyle = g.fillStyle = getComputedStyle(this).color;
    g.strokeRect(left, top, bounds.width * scale, bounds.height * scale);
    for (const { x, y } of particles) {
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
      g.beginPath();
      g.arc(left + x * scale, top + y * scale, 2, 0, 2 * Math.PI);
      g.fill();
    }
  }

  #pick(event) {
    if (!this.#view || !this.#state) return;
    const { left, top, scale } = this.#view;
    const rect = this.#canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - left) / scale;
    const y = (event.clientY - rect.top - top) / scale;
    const { width, height } = this.#state.bounds;
    if (x < 0 || y < 0 || x > width || y > height) return;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}

customElements.define("particles-dots", ParticlesDots);
