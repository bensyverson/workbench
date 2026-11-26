// The names an expression or statement reads that it does not declare itself, found by walking its syntax tree with
// the scopes JavaScript has: a function's parameters and `var`s, a block's `let`, `const`, class and function
// declarations, a loop head, a `catch` parameter, a class's and a function expression's own name. No Node built-ins.

/** @typedef {any} N  an acorn node: the tree is walked by its `type` strings, as ESTree names them */

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/** The child nodes of `node`, in source order. @param {N} node @returns {N[]} */
export function children(node) {
  /** @type {N[]} */
  const out = [];
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x !== null && typeof x === "object" && typeof x.type === "string") out.push(x); }
    else if (v !== null && typeof v === "object" && typeof v.type === "string") out.push(v);
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The names a binding pattern binds: a name, or an object or array pattern with rest elements, renamed keys and
 * defaults (a default's value binds nothing).
 * @param {N} p
 * @returns {string[]}
 */
export function patternNames(p) {
  switch (p?.type) {
    case "Identifier": return [p.name];
    case "ObjectPattern": return p.properties.flatMap((/** @type {N} */ x) => patternNames(x.type === "Property" ? x.value : x));
    case "ArrayPattern": return p.elements.flatMap(patternNames);
    case "AssignmentPattern": return patternNames(p.left);
    case "RestElement": return patternNames(p.argument);
    default: return [];
  }
}

/** The names `var` declarations under `node` bind, not looking into functions or class bodies. @param {N} node @param {string[]} out */
function varNames(node, out) {
  for (const c of children(node)) {
    if (FUNCTIONS.has(c.type) || c.type === "ClassBody") continue;
    if (c.type === "VariableDeclaration" && c.kind === "var") for (const d of c.declarations) out.push(...patternNames(d.id));
    varNames(c, out);
  }
}

/** The names the statements of one block declare: `let`, `const`, class and function declarations. @param {N[]} stmts */
function lexicalNames(stmts) {
  /** @type {string[]} */
  const out = [];
  for (const s of stmts) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") for (const d of s.declarations) out.push(...patternNames(d.id));
    else if ((s.type === "ClassDeclaration" || s.type === "FunctionDeclaration") && s.id) out.push(s.id.name);
  }
  return out;
}

/**
 * The names `root` reads that no scope inside it declares. A property name after `.`, an object key, a label and
 * a declaration's own name are not reads; a shorthand `{ a }` and an assignment to a name are.
 * @param {N} root
 * @returns {Set<string>}
 */
export function freeNames(root) {
  /** @type {Set<string>} */
  const free = new Set();
  /** @type {Array<Set<string>>} */
  const scopes = [];
  const scoped = (/** @type {string[]} */ names, /** @type {() => void} */ body) => { scopes.push(new Set(names)); body(); scopes.pop(); };

  /** A binding pattern holds reads only in its defaults and computed keys. @param {N} p */
  function binding(p) {
    switch (p?.type) {
      case "ObjectPattern": for (const x of p.properties) { if (x.type === "Property") { if (x.computed) visit(x.key); binding(x.value); } else binding(x); } break;
      case "ArrayPattern": for (const x of p.elements) binding(x); break;
      case "AssignmentPattern": binding(p.left); visit(p.right); break;
      case "RestElement": binding(p.argument); break;
    }
  }

  /** @param {N} f */
  function fn(f) {
    /** @type {string[]} */
    const names = f.params.flatMap(patternNames);
    if (f.type !== "ArrowFunctionExpression") names.push("arguments");
    if (f.type === "FunctionExpression" && f.id) names.push(f.id.name);
    if (f.body.type === "BlockStatement") { varNames(f.body, names); names.push(...lexicalNames(f.body.body)); }
    scoped(names, () => {
      for (const p of f.params) binding(p);
      if (f.body.type === "BlockStatement") for (const s of f.body.body) visit(s);
      else visit(f.body);
    });
  }

  /** @param {N} node */
  function visit(node) {
    switch (node.type) {
      case "Identifier": if (!scopes.some((s) => s.has(node.name))) free.add(node.name); return;
      case "MetaProperty": case "BreakStatement": case "ContinueStatement": return;
      case "LabeledStatement": visit(node.body); return;
      case "MemberExpression": visit(node.object); if (node.computed) visit(node.property); return;
      case "Property": case "PropertyDefinition": case "MethodDefinition":
        if (node.computed) visit(node.key);
        if (node.value) visit(node.value);
        return;
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": fn(node); return;
      case "ClassDeclaration": case "ClassExpression":
        scoped(node.id ? [node.id.name] : [], () => { if (node.superClass) visit(node.superClass); visit(node.body); });
        return;
      case "BlockStatement": case "StaticBlock": scoped(lexicalNames(node.body), () => { for (const s of node.body) visit(s); }); return;
      case "SwitchStatement":
        visit(node.discriminant);
        scoped(lexicalNames(node.cases.flatMap((/** @type {N} */ c) => c.consequent)), () => { for (const c of node.cases) { if (c.test) visit(c.test); for (const s of c.consequent) visit(s); } });
        return;
      case "ForStatement": case "ForInStatement": case "ForOfStatement": {
        const head = node.type === "ForStatement" ? node.init : node.left;
        scoped(head?.type === "VariableDeclaration" && head.kind !== "var" ? head.declarations.flatMap((/** @type {N} */ d) => patternNames(d.id)) : [], () => { for (const c of children(node)) visit(c); });
        return;
      }
      case "CatchClause": scoped(patternNames(node.param), () => { binding(node.param); visit(node.body); }); return;
      case "VariableDeclaration": for (const d of node.declarations) { binding(d.id); if (d.init) visit(d.init); } return;
      default: for (const c of children(node)) visit(c);
    }
  }

  visit(root);
  return free;
}
