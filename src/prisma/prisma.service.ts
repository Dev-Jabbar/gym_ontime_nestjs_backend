import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// PRISMA 7 CHANGE: a driver adapter is now REQUIRED — `new PrismaClient()`
// with no adapter throws at runtime. This is a genuine architectural shift
// (Prisma 7 made the client "engine-less" by default), not just a syntax
// tweak like Step 1's tsconfig fix.
//
// The adapter is built inside the constructor (not as a module-level
// constant) deliberately — so it reads `process.env.DATABASE_URL` only
// once Nest has actually started booting, after ConfigModule has had a
// chance to load .env. Building it at import-time risked reading an
// still-empty env var, depending on module load order.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // LATENCY FIX (2026-09-30). Measured from Port Harcourt to Neon us-east-2:
      // opening a connection costs ~4s (TLS + auth round trips) and a warm
      // query ~340ms. node-postgres closes idle connections after 10s by
      // default, so between requests in dev every call paid the ~4s connect
      // again (and a request running 2 queries in parallel paid it twice).
      // Keep connections open much longer and enable TCP keep-alive so they
      // are not silently dropped.
      idleTimeoutMillis: 5 * 60 * 1000,
      keepAlive: true,
      max: 10,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    // Pre-open a few connections at boot so the first real requests do not
    // pay the connect cost. Failure here must never stop the app from
    // starting (Neon may be cold-starting; the next request will retry).
    try {
      await Promise.all(
        [1, 2, 3].map(() => this.$queryRaw`SELECT 1`),
      );
    } catch {
      // ignore: warm-up is best effort
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
