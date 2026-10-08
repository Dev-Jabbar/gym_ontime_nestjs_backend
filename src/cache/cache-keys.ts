// Central place for cache keys + TTLs so reads and invalidation can never
// drift apart (a typo'd key in one place is a stale-data bug that no
// compiler will catch).

// Everything the class endpoints cache lives under this prefix, so one
// prefix delete invalidates all of it.
export const CLASSES_PREFIX = 'classes:';

export const CacheKeys = {
  classList: () => `${CLASSES_PREFIX}list`,
  classDetail: (id: string) => `${CLASSES_PREFIX}detail:${id}`,
} as const;

// Invalidation on every write path is the real mechanism; the TTL is only a
// safety net for the tiny race where a read that started before a write
// finishes after the invalidation and re-caches the old row.
export const CLASSES_TTL_SECONDS = 60;
