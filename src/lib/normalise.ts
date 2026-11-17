/** Trim, collapse inner whitespace and upper-case a plate / chassis / engine value. */
export const normaliseField = (v: string): string =>
  v.trim().replace(/\s+/g, " ").toUpperCase();
