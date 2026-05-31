/** Parse and normalize unlimited product search keywords stored in `products.tags`. */

export function parseTagsInput(raw: unknown): string[] {
  if (raw == null || raw === '') return [];

  let items: unknown[] = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        items = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        items = trimmed.split(',');
      }
    } else {
      items = trimmed.split(',');
    }
  } else {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of items) {
    const tag = String(item).trim().replace(/\s+/g, ' ');
    if (!tag || tag.length > 100) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** SQL fragment: match search pattern against any tag (case-insensitive). */
export function tagSearchSql(paramIndex: number): string {
  return `EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS t(tag)
    WHERE tag ILIKE $${paramIndex}
  )`;
}
