import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

// This is the fix that actually holds up, after two attempts (forwardRef,
// then @Global()) that didn't. Both of those tried to make ONE module
// (AuthModule) the sole owner of JwtModule/JwtAuthGuard/RolesGuard, then
// share that ownership across a module boundary — first via a circular
// import, then via Nest's global-provider registry. Guards referenced by
// class (@UseGuards(JwtAuthGuard)) get resolved against the CONTROLLER'S
// OWN host module, and that lookup doesn't reliably follow either forwardRef
// or @Global() the way plain constructor injection does — hence the same
// "JwtService not available in UsersModule" error surviving both fixes.
//
// The fix that removes the problem instead of routing around it: don't let
// any module "own" these and export them to another. Put JwtModule +
// both guards in their OWN standalone module, and have every feature module
// that needs them (AuthModule, UsersModule) import THIS module directly.
// Each of AuthModule and UsersModule now has its own direct line to
// JwtService's actual provider — no cross-feature-module lookup involved
// at all, for either constructor injection or @UseGuards() class references.
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
  // Re-exporting JwtModule alongside the guards means anything that imports
  // JwtGuardsModule also gets JwtService injectable directly (AuthService
  // needs this to sign tokens on login/register).
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class JwtGuardsModule {}
