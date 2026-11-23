// The syntax tree for one runtime lambda: an ESTree subset. Every node carries
// `loc` (1-based line, 0-based column, relative to the lambda's source) and
// `range` (character offsets), so diagnostics and fixits can point and edit.

export interface Position { line: number; column: number }
export interface Loc { start: Position; end: Position }

interface Base { loc: Loc; range: [number, number] }

export interface Identifier extends Base { type: "Identifier"; name: string }
export interface Literal extends Base {
  type: "Literal";
  value: string | number | boolean | null;
  /** The literal exactly as written, e.g. `0x10` or `'a'`. */
  raw: string;
}
export interface TemplateElement extends Base { type: "TemplateElement"; value: { raw: string; cooked: string }; tail: boolean }
export interface TemplateLiteral extends Base { type: "TemplateLiteral"; quasis: TemplateElement[]; expressions: Expression[] }
export interface ThisExpression extends Base { type: "ThisExpression" }
export interface ArrayExpression extends Base { type: "ArrayExpression"; elements: Array<Expression | SpreadElement | null> }
export interface Property extends Base {
  type: "Property";
  key: Identifier | Literal | Expression;
  value: Expression;
  computed: boolean;
  shorthand: boolean;
  kind: "init";
  method: false;
}
export interface ObjectExpression extends Base { type: "ObjectExpression"; properties: Array<Property | SpreadElement> }
export interface SpreadElement extends Base { type: "SpreadElement"; argument: Expression }
export interface ArrowFunctionExpression extends Base {
  type: "ArrowFunctionExpression";
  params: Pattern[];
  body: BlockStatement | Expression;
  expression: boolean;
}
export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";
export interface UnaryExpression extends Base { type: "UnaryExpression"; operator: UnaryOperator; prefix: true; argument: Expression }
export interface UpdateExpression extends Base { type: "UpdateExpression"; operator: "++" | "--"; prefix: boolean; argument: Expression }
export type BinaryOperator =
  | "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "<<" | ">>" | ">>>"
  | "+" | "-" | "*" | "/" | "%" | "**" | "|" | "^" | "&" | "in" | "instanceof";
export interface BinaryExpression extends Base { type: "BinaryExpression"; operator: BinaryOperator; left: Expression; right: Expression }
export type LogicalOperator = "||" | "&&" | "??";
export interface LogicalExpression extends Base { type: "LogicalExpression"; operator: LogicalOperator; left: Expression; right: Expression }
export type AssignmentOperator =
  | "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "**=" | "<<=" | ">>=" | ">>>=" | "|=" | "^=" | "&=" | "||=" | "&&=" | "??=";
export interface AssignmentExpression extends Base { type: "AssignmentExpression"; operator: AssignmentOperator; left: Pattern; right: Expression }
export interface ConditionalExpression extends Base { type: "ConditionalExpression"; test: Expression; consequent: Expression; alternate: Expression }
export interface CallExpression extends Base { type: "CallExpression"; callee: Expression; arguments: Array<Expression | SpreadElement>; optional: boolean }
export interface NewExpression extends Base { type: "NewExpression"; callee: Expression; arguments: Array<Expression | SpreadElement> }
export interface MemberExpression extends Base { type: "MemberExpression"; object: Expression; property: Expression; computed: boolean; optional: boolean }
export interface SequenceExpression extends Base { type: "SequenceExpression"; expressions: Expression[] }

export type Expression =
  | Identifier | Literal | TemplateLiteral | ThisExpression | ArrayExpression | ObjectExpression
  | ArrowFunctionExpression | UnaryExpression | UpdateExpression | BinaryExpression | LogicalExpression
  | AssignmentExpression | ConditionalExpression | CallExpression | NewExpression | MemberExpression
  | SequenceExpression;

export interface AssignmentProperty extends Base {
  type: "Property";
  key: Identifier | Literal;
  value: Pattern;
  computed: false;
  shorthand: boolean;
  kind: "init";
  method: false;
}
export interface ObjectPattern extends Base { type: "ObjectPattern"; properties: AssignmentProperty[] }
export interface ArrayPattern extends Base { type: "ArrayPattern"; elements: Array<Pattern | null> }
export interface AssignmentPattern extends Base { type: "AssignmentPattern"; left: Pattern; right: Expression }
/** Binding targets; assignment targets may also be a MemberExpression. */
export type Pattern = Identifier | ObjectPattern | ArrayPattern | AssignmentPattern | MemberExpression;

export interface ExpressionStatement extends Base { type: "ExpressionStatement"; expression: Expression }
export interface BlockStatement extends Base { type: "BlockStatement"; body: Statement[] }
export interface EmptyStatement extends Base { type: "EmptyStatement" }
export interface VariableDeclarator extends Base { type: "VariableDeclarator"; id: Pattern; init: Expression | null }
export interface VariableDeclaration extends Base { type: "VariableDeclaration"; kind: "const" | "let" | "var"; declarations: VariableDeclarator[] }
export interface IfStatement extends Base { type: "IfStatement"; test: Expression; consequent: Statement; alternate: Statement | null }
export interface ForStatement extends Base {
  type: "ForStatement";
  init: VariableDeclaration | Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: Statement;
}
export interface ForOfStatement extends Base { type: "ForOfStatement"; left: VariableDeclaration | Pattern; right: Expression; body: Statement }
export interface WhileStatement extends Base { type: "WhileStatement"; test: Expression; body: Statement }
export interface DoWhileStatement extends Base { type: "DoWhileStatement"; body: Statement; test: Expression }
export interface ReturnStatement extends Base { type: "ReturnStatement"; argument: Expression | null }
export interface BreakStatement extends Base { type: "BreakStatement"; label: null }
export interface ContinueStatement extends Base { type: "ContinueStatement"; label: null }

export type Statement =
  | ExpressionStatement | BlockStatement | EmptyStatement | VariableDeclaration | IfStatement
  | ForStatement | ForOfStatement | WhileStatement | DoWhileStatement | ReturnStatement
  | BreakStatement | ContinueStatement;

export type Node = Expression | Statement | Pattern | Property | AssignmentProperty | SpreadElement | VariableDeclarator | TemplateElement;

/** A machine-applicable replacement of `range` in the lambda's source. */
export interface Edit { range: [number, number]; text: string }

export interface Diagnostic {
  /** Stable code: `P…` for syntax the parser cannot read, `S…` for subset violations. */
  code: string;
  severity: "error" | "warning";
  /** What is wrong, naming the construct. */
  message: string;
  /** One line telling the author what to write instead. */
  tip: string;
  loc: Loc;
  range: [number, number];
  /** Present when the rewrite is mechanical: apply these edits to the source, in any order. */
  edits?: Edit[];
}

export type ParseResult =
  | { ok: true; ast: ArrowFunctionExpression; diagnostics: Diagnostic[] }
  | { ok: false; ast: null; diagnostics: Diagnostic[] };
