// Stands in for the kit's kit/define in the package probe: a module a package imports by a bare name.
export const defineDialect = (def) => Object.freeze({ ...def, made: "stub" });
