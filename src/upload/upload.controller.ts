import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, UseGuards } from '@nestjs/common';
import { UploadService } from './upload.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

// Mounted at /api/uploads. Any authenticated role may request a signature:
// it only proves the caller is a logged-in user of this app. What the
// uploaded URL is later used for (for example as one's own avatar) is
// enforced by the endpoint that consumes it. Hence JwtAuthGuard only, with no
// RolesGuard or @Roles().
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
