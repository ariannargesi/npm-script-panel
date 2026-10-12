/** How many recent scripts the panel shows. */
export const MAX_RECENT_SHOWN = 5;

/** How many are remembered, so scripts that were removed from package.json do not empty the list. */
export const MAX_RECENT_STORED = 20;

/** Puts `script` at the front, dropping any earlier occurrence. */
export function recordRecent(
  list: readonly string[],
  script: string,
  max = MAX_RECENT_STORED,
): string[] {
  return [script, ...list.filter((name) => name !== script)].slice(0, max);
}

/** The most recent scripts that still exist in package.json, newest first. */
export function visibleRecent(
  list: readonly string[],
  existing: ReadonlySet<string>,
  max = MAX_RECENT_SHOWN,
): string[] {
  return list.filter((name) => existing.has(name)).slice(0, max);
}
