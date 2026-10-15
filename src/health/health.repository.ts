import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Only repositories touch Prisma (project rule), so the health check's
// database ping lives here.
@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Cheapest possible round trip to Postgres. Throws if unreachable. */
  async pingDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
