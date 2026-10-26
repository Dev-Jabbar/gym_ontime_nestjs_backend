import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersRepository } from './users.repository.js';
import { UsersController } from './users.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Declares the providers this feature owns and the ones it exports for other
// modules to inject. Dependencies flow through this declared graph, which is
// what lets UsersService's internals change without affecting its consumers.
//
// Imports JwtGuardsModule directly (not AuthModule), which is what makes
// UsersController's @UseGuards(JwtAuthGuard, RolesGuard) resolve. There is no
// dependency on AuthModule, so there is no cycle to work around.
@Module({
  imports: [JwtGuardsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
