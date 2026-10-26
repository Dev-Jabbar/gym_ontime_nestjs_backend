// Central place for cache keys and TTLs, so reads and invalidation cannot
// drift apart (a mistyped key is a stale-data bug the compiler cannot catch).

// Everything the class endpoints cache lives under this prefix, so a single
// prefix delete invalidates all of it.
export const CLASSES_PREFIX = 'classes:';

export const CacheKeys = {
  classList: () => `${CLASSES_PREFIX}list`,
  classDetail: (id: string) => `${CLASSES_PREFIX}detail:${id}`,
} as const;

// Invalidation on every write path is the real mechanism. The TTL is only a
// safety net for the narrow race where a read that started before a write
// finishes after the invalidation and re-caches the old row.
export const CLASSES_TTL_SECONDS = 60;
