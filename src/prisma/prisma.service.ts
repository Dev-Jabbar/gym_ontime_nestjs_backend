import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 requires a driver adapter: `new PrismaClient()` without one throws
// at runtime.
//
// The adapter is built inside the constructor rather than as a module-level
// constant so it reads `process.env.DATABASE_URL` only once Nest has started
// booting. Building it at import time risked reading an empty variable,
// depending on module load order.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // Connection tuning for a remote database. Measured from Port Harcourt
      // to Neon us-east-2, opening a connection costs about 4s (TLS and auth
      // round trips) while a warm query takes about 340ms. node-postgres closes
      // idle connections after 10s by default, so between requests every call
      // paid the connect cost again. Keep connections open much longer and
      // enable TCP keep-alive so they are not silently dropped.
      idleTimeoutMillis: 5 * 60 * 1000,
      keepAlive: true,
      max: 10,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    // Pre-open a few connections at boot so the first real requests do not
    // pay the connect cost. A failure here must never stop the app from
    // starting (Neon may be cold-starting; the next request will retry).
    try {
      await Promise.all(
        [1, 2, 3].map(() => this.$queryRaw`SELECT 1`),
      );
    } catch {
      // Ignored: warm-up is best effort.
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
