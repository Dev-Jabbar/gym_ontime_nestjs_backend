import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Creates (or repairs) the admin account.
//
// A standalone script: it does not boot Nest. It builds its own PrismaClient
// (Prisma 7 needs the pg driver adapter) and talks to the database directly.
// This is the one place outside a repository that uses Prisma, because it is
// a one-off operational tool rather than part of the request path.
//
// Run: npm run seed:admin. Safe to run repeatedly (idempotent).
//
// Configuration (all optional except ADMIN_PASSWORD in production):
//   ADMIN_EMAIL     default momohabduljabbar@gmail.com
//   ADMIN_NAME      default vintage_jab
//   ADMIN_PASSWORD  default Admin12345 in development; required when
//                   NODE_ENV=production
//   ADMIN_AVATAR    default /jabbar2.jpg

const DEFAULT_PASSWORD = 'Admin12345';

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'momohabduljabbar@gmail.com';
  const name = process.env.ADMIN_NAME ?? 'vintage_jab';
  const avatar = process.env.ADMIN_AVATAR ?? '/jabbar2.jpg';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !process.env.ADMIN_PASSWORD) {
    throw new Error(
      'ADMIN_PASSWORD must be set when NODE_ENV=production (refusing to seed the default password).',
    );
  }
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      // Never touch an existing password. Only make sure the account is a
      // usable admin (role, active) and has an AdminProfile row.
      const needsFix =
        existing.role !== 'admin' || !existing.isActive || existing.deletedAt;

      await prisma.$transaction(async (tx) => {
        if (needsFix) {
          await tx.user.update({
            where: { id: existing.id },
            data: { role: 'admin', isActive: true, deletedAt: null },
          });
        }
        // An empty update keeps any avatar the admin has since changed.
        await tx.adminProfile.upsert({
          where: { userId: existing.id },
          update: {},
          create: { userId: existing.id, avatar },
        });
      });

      console.log(
        needsFix
          ? `Admin ${email} already existed; promoted/reactivated it and ensured the profile.`
          : `Admin ${email} already exists; profile ensured. Nothing else changed.`,
      );
      return;
    }

    // Prisma has no pre-save hook, so hash explicitly (10 rounds, as in UsersService).
    const hashed = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: 'admin',
        adminProfile: { create: { avatar } }, // User and profile in one write.
      },
    });

    console.log(`Admin seeded: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(
        `Using the default dev password (${DEFAULT_PASSWORD}). Set ADMIN_PASSWORD to choose your own.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Admin seed failed:', err);
  process.exit(1);
});
