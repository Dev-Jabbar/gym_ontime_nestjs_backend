// Prisma's default maxWait (the time allowed to get a free connection to start
// a transaction) is 2s, which is too tight for a remote pooled database such
// as Neon's free tier. Every repository transaction passes these options
// instead.
export const TX_OPTIONS = { maxWait: 10000, timeout: 20000 } as const;
