// The lexical scan of a program's top-level bindings moved into the kit (kit/parse/toplevel.js), since the
// Definition API's hosts need it in the page too; the DMG scripts keep importing it from here.
export * from "../../kit/parse/toplevel.js";
