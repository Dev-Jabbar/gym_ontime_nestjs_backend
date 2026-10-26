import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global() lets any module inject PrismaService without listing PrismaModule
// in its own imports, which suits shared infrastructure. Feature modules
// (UsersModule, AuthModule, ...) are deliberately not global: their services
// are only available to modules that import them explicitly.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
