// ============================================================================
// API field helpers — normalize snake_case / camelCase API payloads safely
// ============================================================================

export type ApiRecord = Record<string, unknown>;

function defaultSnakeKey(camelKey: string): string {
  return camelKey.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

/** Read a trimmed string from either camelCase or snake_case keys. */
export function pickString(
  record: ApiRecord,
  camelKey: string,
  snakeKey?: string
): string | undefined {
  const keys = [camelKey, snakeKey ?? defaultSnakeKey(camelKey)];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/** Read a finite number from either camelCase or snake_case keys. */
export function pickNumber(
  record: ApiRecord,
  camelKey: string,
  snakeKey?: string
): number | undefined {
  const keys = [camelKey, snakeKey ?? defaultSnakeKey(camelKey)];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** Read a boolean from either camelCase or snake_case keys. */
export function pickBoolean(
  record: ApiRecord,
  camelKey: string,
  snakeKey?: string
): boolean | undefined {
  const keys = [camelKey, snakeKey ?? defaultSnakeKey(camelKey)];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}
