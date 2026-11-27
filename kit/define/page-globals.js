// The page globals: the names a Kernel reads from the page itself rather than from its part's current globals, when
// a Dialect declares a global by one of them. An explicit list, not `name in globalThis`, so the same Dialect lowers
// and compiles alike in every host: a browser has `screen`, `status`, `name`, `top`, `origin` and `event` on its
// global object, Node has none of them, and a Dialect global so named is the run's value in both (leaf 9t99go).
// Math is the one the repo's Dialects rely on (the DMG, particles, the trials' Dialects); add a name only for a
// global object every host the kit runs in has, with the same members.

/** @type {readonly string[]} */
export const PAGE_GLOBALS = Object.freeze(["Math"]);
