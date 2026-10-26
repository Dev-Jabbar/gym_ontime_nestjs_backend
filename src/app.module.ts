import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CacheModule } from './cache/cache.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { AdminProfileModule } from './admin-profile/admin-profile.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MemberProfileModule } from './member-profile/member-profile.module.js';
import { TrainerProfileModule } from './trainer-profile/trainer-profile.module.js';
import { UploadModule } from './upload/upload.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { HealthModule } from './health/health.module.js';
import { throttlingDisabled } from './common/throttle.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting is not global: no guard is registered app-wide. Only
    // routes that opt in with @UseGuards(ThrottlerGuard) are limited (login and
    // register). These defaults apply unless a route overrides them with
    // @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      errorMessage: 'Too many attempts. Please wait a minute and try again.',
      skipIf: () => throttlingDisabled(),
    }),
    PrismaModule,
    CacheModule,
    // Order matters: AuthModule must come before UsersModule.
    // AuthController's static route GET /api/users/me has to register before
    // UsersController's dynamic GET /api/users/:id, or "me" is captured as an
    // id. See the note at the top of users.controller.ts. If these two are
    // reordered, retest GET /api/users/me.
    AuthModule,
    UsersModule,
    ClassesModule,
    AdminProfileModule,
    NotificationsModule,
    MemberProfileModule,
    TrainerProfileModule,
    UploadModule,
    PaymentsModule,
    HealthModule,
    // BullMQ queue. Needs Redis, so it is skipped when REDIS_URL is unset.
    // main.ts loads .env before this file is evaluated, so the check is safe.
    // QueuesModule reads REDIS_URL lazily (forRootAsync), so importing it
    // without Redis configured does not crash the app.
    ...(process.env.REDIS_URL ? [QueuesModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
