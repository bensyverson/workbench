// The stage element of the passing fixture: draws state.particles as dots and reports a click as a pick.
// Properties in (state, params, text), events out (wb-pick).
class ParticlesField extends HTMLElement {
  #state = null;
  set state(v) { this.#state = v; this.#draw(); }
  get state() { return this.#state; }
  connectedCallback() {
    // A property set before the definition loaded sits on the instance; take it over (the lazy-property pitfall).
    if (Object.prototype.hasOwnProperty.call(this, "state")) { const v = this.state; delete this.state; this.state = v; }
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" }).innerHTML = "<canvas width=400 height=300></canvas>";
    this.shadowRoot.querySelector("canvas").addEventListener("click", (e) => {
      const s = this.#state;
      if (!s) return;
      const r = e.target.getBoundingClientRect();
      const detail = { x: ((e.clientX - r.left) / r.width) * s.bounds.width, y: ((e.clientY - r.top) / r.height) * s.bounds.height };
      this.dispatchEvent(new CustomEvent("wb-pick", { detail, bubbles: true, composed: true }));
    });
    this.#draw();
  }
  #draw() {
    const c = this.shadowRoot?.querySelector("canvas");
    const s = this.#state;
    if (!c || !s) return;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (const p of s.particles) g.fillRect((p.x / s.bounds.width) * c.width, (p.y / s.bounds.height) * c.height, 2, 2);
  }
}
customElements.define("particles-field", ParticlesField);
