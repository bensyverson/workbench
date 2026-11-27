// The page's layout as a pure function (project/2026-11-27-controls-draft.md, requirement 9): each generated view is a
// root, and each tile is placed against the view or tile its `place` names, in declaration order. `tabWith` joins
// the target's tab group (a tile tabbed with the stage shares its tabs); a split puts the tile beside the target's
// node, its group included, in a tree. A tile placed against a tile not yet placed waits for it. Tested without a DOM.

/**
 * A layout node: a generated view, a tile of one part, a tab group, or a split of a main node and the tile beside it.
 * @typedef {{ view: string } | { tile: string, part: string } | { tabs: Node[] } | { split: "right" | "left" | "above" | "below", size: number, main: Node, side: Node }} Node
 */

const SPLITS = /** @type {const} */ ({ splitRight: "right", splitLeft: "left", splitAbove: "above", splitBelow: "below" });

/**
 * The layout of the UIs' tiles around the generated views.
 * @param {Array<{ part: string, ui: any }>} uis  each part's UI, in the composition's order
 * @param {string[]} views  the generated views the host shows, each a root
 * @returns {Record<string, Node>}
 */
export function layoutOf(uis, views) {
  /** @type {Record<string, Node>} */
  const roots = Object.fromEntries(views.map((v) => [v, { view: v }]));
  /** @type {Array<{ part: string, id: string, dir: string, target: string, size?: number }>} */
  let waiting = [];
  for (const { part, ui } of uis) {
    for (const [id, t] of Object.entries(/** @type {Record<string, any>} */ (ui?.tiles ?? {}))) {
      const dir = Object.keys(t.place ?? {}).find((k) => k === "tabWith" || k in SPLITS);
      if (dir) waiting.push({ part, id, dir, target: t.place[dir], ...(typeof t.place.size === "number" ? { size: t.place.size } : {}) });
    }
  }
  /** Where a view or tile is: its root and the path of the node that holds it (a tab group holds its tabs). @param {string} name @param {string} part */
  const find = (name, part) => {
    for (const [root, node] of Object.entries(roots)) {
      const path = locate(node, name, part);
      if (path) return { root, path };
    }
    return null;
  };
  // a tile against a tile not yet placed waits; a pass that places none ends it (a cycle is defineUI's U003)
  for (let placed = true; placed && waiting.length;) {
    placed = false;
    const next = [];
    for (const w of waiting) {
      const at = find(w.target, w.part);
      if (!at) { next.push(w); continue; }
      const leaf = { tile: w.id, part: w.part };
      roots[at.root] = replace(roots[at.root], at.path, (n) => {
        if (w.dir === "tabWith") return "tabs" in n ? { tabs: [...n.tabs, leaf] } : { tabs: [n, leaf] };
        return { split: /** @type {any} */ (SPLITS)[w.dir], size: w.size ?? 0.5, main: n, side: leaf };
      });
      placed = true;
    }
    waiting = next;
  }
  return roots;
}

/**
 * The path to the node that holds a view or a part's tile: a tab group holding it, else the leaf itself.
 * @param {Node} node @param {string} name @param {string} part @returns {Array<string | number> | null}
 */
function locate(node, name, part) {
  const is = (/** @type {Node} */ n) => ("view" in n && n.view === name) || ("tile" in n && n.tile === name && n.part === part);
  if (is(node)) return [];
  if ("tabs" in node) {
    if (node.tabs.some(is)) return [];
    for (const [i, t] of node.tabs.entries()) { const p = locate(t, name, part); if (p) return ["tabs", i, ...p]; }
  }
  if ("split" in node) {
    for (const k of /** @type {const} */ (["main", "side"])) { const p = locate(node[k], name, part); if (p) return [k, ...p]; }
  }
  return null;
}

/** A copy of a tree with the node at `path` replaced by `f(node)`. @param {Node} node @param {Array<string | number>} path @param {(n: Node) => Node} f @returns {Node} */
function replace(node, path, f) {
  if (!path.length) return f(node);
  const [k, ...rest] = path;
  if (k === "tabs") { const i = /** @type {number} */ (rest[0]); const tabs = [.../** @type {any} */ (node).tabs]; tabs[i] = replace(tabs[i], rest.slice(1), f); return { tabs }; }
  return { .../** @type {any} */ (node), [k]: replace(/** @type {any} */ (node)[k], rest, f) };
}
