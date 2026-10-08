import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CacheModule,
    // ORDER MATTERS: AuthModule before UsersModule. AuthController's
    // static route GET /api/users/me must register before UsersController's
    // dynamic GET /api/users/:id, or a request to /api/users/me gets
    // swallowed by :id treating "me" as an id. See the long comment at the
    // top of users.controller.ts for the full explanation and why a
    // path-level fix (regex-constraining :id) isn't available in this
    // Express/path-to-regexp version. If you ever reorder these two, retest
    // GET /api/users/me specifically.
    AuthModule,
    UsersModule,
    ClassesModule,
    AdminProfileModule,
    NotificationsModule,
    MemberProfileModule,
    TrainerProfileModule,
    UploadModule,
    PaymentsModule,
    // Bull queue (Step 5). Needs Redis; skipped when REDIS_URL is unset.
    // main.ts loads .env before this file is evaluated, so the check is safe.
    ...(process.env.REDIS_URL ? [QueuesModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
