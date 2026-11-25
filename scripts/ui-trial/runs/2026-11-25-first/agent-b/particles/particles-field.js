// The particles stage: every particle as a dot in the box; a click is a pick in state coordinates.
class ParticlesField extends HTMLElement {
  #state;
  #canvas = document.createElement("canvas");

  constructor() {
    super();
    this.#canvas.style.cssText = "display:block;max-width:100%;height:auto";
    this.#canvas.addEventListener("click", (event) => this.#pick(event));
    this.attachShadow({ mode: "open" }).append(this.#canvas);
  }

  connectedCallback() {
    // A property the host set before the element was defined hides the accessor; hand it over.
    if (Object.hasOwn(this, "state")) {
      const value = this.state;
      delete this.state;
      this.state = value;
    }
    this.#draw();
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
    if (!state) return;
    const canvas = this.#canvas;
    const { width, height } = state.bounds;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, width, height);
    g.strokeStyle = g.fillStyle = getComputedStyle(this).color || "black";
    g.strokeRect(0.5, 0.5, width - 1, height - 1);
    for (const { x, y } of state.particles) {
      g.beginPath();
      g.arc(x, y, 2, 0, 2 * Math.PI);
      g.fill();
    }
  }

  #pick(event) {
    if (!this.#state) return;
    const box = this.#canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const { width, height } = this.#state.bounds;
    const x = ((event.clientX - box.left) / box.width) * width;
    const y = ((event.clientY - box.top) / box.height) * height;
    this.dispatchEvent(new CustomEvent("wb-pick", { detail: { x, y }, bubbles: true, composed: true }));
  }
}

customElements.define("particles-field", ParticlesField);
