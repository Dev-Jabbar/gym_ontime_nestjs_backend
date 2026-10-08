import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved the database connection URL OUT of schema.prisma and
// into this file — it's read only by the Prisma CLI (migrate, studio,
// db pull, etc.), never by your running NestJS app. Your app gets its
// own connection separately, via a driver adapter (see prisma.service.ts) —
// that split is deliberate in Prisma 7, not an oversight.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
