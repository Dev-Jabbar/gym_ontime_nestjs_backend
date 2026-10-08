// Prisma's default maxWait (time to get a free connection to START a
// transaction) is 2s — too tight against Neon's free-tier pool. Every
// repository transaction passes this instead. (Was previously repeated
// inline at every $transaction call site.)
export const TX_OPTIONS = { maxWait: 10000, timeout: 20000 } as const;
