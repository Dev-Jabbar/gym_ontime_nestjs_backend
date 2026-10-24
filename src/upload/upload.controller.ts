import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, UseGuards } from '@nestjs/common';
import { UploadService } from './upload.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

// Mounted at /api/uploads (matches Express's app.use("/api/uploads", ...)).
//
// Any authenticated role can get a signature — this just proves "I'm a
// logged-in user of this app," not "I'm allowed to upload anything
// specific." What the uploaded URL is later used for (e.g. saved as your
// own avatar) is enforced by the profile-update endpoint that consumes it,
// not by this endpoint. So JwtAuthGuard only, no RolesGuard/@Roles() —
// same as Express's protect() call with no roles array.
@ApiTags('Uploads')
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // POST /api/uploads/signature
  @ApiOperation({ summary: 'Get a signed Cloudinary upload signature' })
  @Post('signature')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  getUploadSignature() {
    return this.uploadService.getUploadSignature();
  }
}
