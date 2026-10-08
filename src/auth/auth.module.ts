import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { JwtGuardsModule } from './jwt-guards.module.js';

// No @Global(), no forwardRef — AuthModule just imports the two things it
// actually needs: UsersModule (so AuthService can inject UsersService) and
// JwtGuardsModule (so AuthController's @UseGuards(JwtAuthGuard) and
// AuthService's JwtService injection both resolve, via JwtGuardsModule's
// own self-contained JwtModule.registerAsync(...)).
@Module({
  imports: [UsersModule, JwtGuardsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
