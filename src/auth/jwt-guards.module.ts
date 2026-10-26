import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

// Standalone module that owns JwtModule and both guards, imported directly by
// every feature module that needs them (AuthModule, UsersModule, ...).
//
// Guards referenced by class (@UseGuards(JwtAuthGuard)) are resolved against
// the controller's own host module, and that lookup does not reliably follow
// forwardRef or @Global() the way constructor injection does. Having one
// feature module own the guards and export them across a module boundary
// therefore fails with "JwtService not available". Giving each importing
// module a direct line to JwtService's provider avoids any cross-module
// lookup.
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  // Re-exporting JwtModule alongside the guards makes JwtService injectable
  // in any module that imports JwtGuardsModule (AuthService needs it to sign
  // tokens).
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class JwtGuardsModule {}
