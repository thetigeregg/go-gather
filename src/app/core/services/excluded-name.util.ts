/** Compiles the user's case-insensitive name-exclusion regexes. Invalid ones
 * (e.g. a user mid-typing an unclosed group) are dropped rather than thrown,
 * so a malformed pattern can't blank out the catalog or break search strings
 * while it's being edited. */
export function compileExcludedPatterns(patterns: readonly string[]): RegExp[] {
  return patterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, 'i')];
    } catch {
      return [];
    }
  });
}

export function isExcludedByName(name: string, excludedPatterns: readonly RegExp[]): boolean {
  return excludedPatterns.some((pattern) => pattern.test(name));
}
