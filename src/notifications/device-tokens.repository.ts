import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class DeviceTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  // A token is unique. If it already exists (for example the same browser
  // was used by another account), it is reassigned to the current user.
  upsert(userId: string, token: string, platform: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastUsedAt: new Date() },
    });
  }

  async findTokensByUserId(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  // Scoped to the user so nobody can unregister someone else's device.
  async deleteForUser(userId: string, token: string): Promise<boolean> {
    const res = await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
    return res.count > 0;
  }

  // Tokens FCM reported as dead.
  async deleteTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const res = await this.prisma.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    });
    return res.count;
  }
}
