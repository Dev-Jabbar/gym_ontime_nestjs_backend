import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersRepository } from './users.repository.js';
import { UsersController } from './users.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// A Module is NestJS's "wiring diagram" for a feature — it declares what
// providers (services) this piece of the app owns, and `exports` says which
// of those other modules are allowed to inject. Nothing like this exists in
// your Express app — there, any file can just `import` any other file
// directly. Nest forces dependencies to flow through this declared graph,
// which is what makes swapping UsersService's internals (in-memory -> Prisma
// in Step 2) invisible to everything that consumes it.
//
// Imports JwtGuardsModule directly (not AuthModule) — this is what makes
// UsersController's @UseGuards(JwtAuthGuard, RolesGuard) resolve correctly.
// No dependency on AuthModule at all, so there's no cycle to work around.
@Module({
  imports: [JwtGuardsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
