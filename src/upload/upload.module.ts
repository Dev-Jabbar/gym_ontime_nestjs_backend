import { Module } from '@nestjs/common';
import { UploadService } from './upload.service.js';
import { UploadController } from './upload.controller.js';
import { JwtGuardsModule } from '../auth/jwt-guards.module.js';

// Imports JwtGuardsModule even though this controller only uses
// JwtAuthGuard (no RolesGuard) — JwtAuthGuard itself needs JwtService
// injected into its constructor, and JwtService only comes from
// JwtGuardsModule. Same reasoning as every other feature module since
// Step 1.5's fix: don't try to get JwtService via a cross-module lookup,
// import the module that actually owns it.
@Module({
  imports: [JwtGuardsModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
