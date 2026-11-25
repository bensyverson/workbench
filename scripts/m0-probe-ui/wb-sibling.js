// A custom element shipped as a sibling ES module, the way a Dialect package would ship one.
// Prefix `wb-` keeps tags apart in the page-wide registry.
export class WbSiblingEl extends HTMLElement {
  static observedAttributes = ["label"];
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = '<b part="label"></b>';
    this.#paint();
  }
  attributeChangedCallback() { this.#paint(); }
  #paint() { const b = this.shadowRoot?.querySelector("b"); if (b) b.textContent = "sibling:" + (this.getAttribute("label") ?? ""); }
}
customElements.define("wb-sibling-el", WbSiblingEl);
export const defined = true;
