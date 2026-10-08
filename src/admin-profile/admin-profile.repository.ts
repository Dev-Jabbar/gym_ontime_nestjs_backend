import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string) {
    return this.prisma.adminProfile.findUnique({ where: { userId } });
  }

  // Upsert: admin accounts come from a seed script, so there's no
  // guarantee a profile row exists yet.
  upsertByUserId(userId: string, data: { avatar?: string }) {
    return this.prisma.adminProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
