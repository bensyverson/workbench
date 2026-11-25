// The particles stage: every particle as a dot in the box, scaled to fit; a click inside the box is a pick.
class ParticlesStage extends HTMLElement {
  #state;
  #canvas;
  #observer;
  #view = null; // { scale, left, top } in CSS pixels, from the last draw

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>:host { display: block; position: relative; overflow: hidden }" +
      "canvas { position: absolute; inset: 0; width: 100%; height: 100% }</style><canvas></canvas>";
    this.#canvas = root.querySelector("canvas");
    this.#canvas.addEventListener("click", (event) => this.#pick(event));
    this.#observer = new ResizeObserver(() => this.#draw());
  }

  connectedCallback() {
    // The host may have set properties before the tag was defined: pass them through the setter.
    if (Object.hasOwn(this, "state")) {
      const early = this.state;
      delete this.state;
      this.state = early;
    }
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer.disconnect();
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
    const canvas = this.#canvas;
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const { bounds, particles } = state;
    const scale = Math.min(width / bounds.width, height / bounds.height);
    const left = (width - bounds.width * scale) / 2;
    const top = (height - bounds.height * scale) / 2;
    this.#view = { scale, left, top };

    const g = canvas.getContext("2d");
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);
    const color = getComputedStyle(this).color;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.strokeRect(left, top, bounds.width * scale, bounds.height * scale);

    g.save();
    g.beginPath();
    g.rect(left, top, bounds.width * scale, bounds.height * scale);
    g.clip();
    g.beginPath();
    for (const { x, y } of particles) {
      const px = left + x * scale;
      const py = top + y * scale;
      g.moveTo(px + 2, py);
      g.arc(px, py, 2, 0, 2 * Math.PI);
    }
    g.fill();
    g.restore();
  }

  #pick(event) {
    if (!this.#view || !this.#state) return;
    const { scale, left, top } = this.#view;
    const box = this.#canvas.getBoundingClientRect();
    const x = (event.clientX - box.left - left) / scale;
    const y = (event.clientY - box.top - top) / scale;
    const { width, height } = this.#state.bounds;
    if (x < 0 || y < 0 || x > width || y > height) return;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}

customElements.define("particles-stage", ParticlesStage);
