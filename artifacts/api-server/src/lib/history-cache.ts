// Cache for the /api/history aggregate. Completed tournaments are immutable, so
// the expensive recompute (a full scoreboard per event) only needs to rerun when
// something that feeds it changes — imports, pick edits, renames, deletes — each
// of which calls bustHistoryCache(). The TTL is just a belt-and-braces backstop.
const TTL_MS = 60 * 60 * 1000; // 1 hour

let cached: { data: unknown; at: number } | null = null;

export function getHistoryCache(): unknown | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) {
    cached = null;
    return null;
  }
  return cached.data;
}

export function setHistoryCache(data: unknown): void {
  cached = { data, at: Date.now() };
}

export function bustHistoryCache(): void {
  cached = null;
}
