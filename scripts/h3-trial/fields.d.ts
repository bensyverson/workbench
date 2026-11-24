// check.js supplies the name "fields" to a sketch file; this lets the type checker resolve it too.
declare module "fields" {
  export const field: typeof import("../../kit/dialects/fields/index.js").field;
}
