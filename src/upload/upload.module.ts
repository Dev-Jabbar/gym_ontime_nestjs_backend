import { Module } from '@nestjs/common';
import { UploadService } from './upload.service.js';
import { UploadController } from './upload.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Imports JwtGuardsModule even though the controller only uses JwtAuthGuard:
// the guard injects JwtService, which JwtGuardsModule provides. Import the
// module that owns it rather than relying on a cross-module lookup.
@Module({
  imports: [JwtGuardsModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
