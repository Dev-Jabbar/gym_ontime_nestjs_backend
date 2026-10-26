import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { JwtGuardsModule } from './jwt-guards.module.js';

// No @Global() and no forwardRef: AuthModule imports only what it needs.
// UsersModule provides UsersService to AuthService, and JwtGuardsModule
// provides JwtService (via its own JwtModule.registerAsync) and the guards.
@Module({
  imports: [UsersModule, JwtGuardsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
