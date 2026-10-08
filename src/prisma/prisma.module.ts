import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global() means any module in the app can inject PrismaService without
// explicitly listing PrismaModule in its own `imports` array — reasonable
// here since almost every feature module will need database access.
// (UsersModule and AuthModule, by contrast, are deliberately NOT global —
// you only get UsersService if you explicitly import UsersModule. Global
// is the exception, not the default, and it's usually reserved for
// infrastructure-level things like this, not feature logic.)
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
