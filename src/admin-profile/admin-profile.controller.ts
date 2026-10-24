import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminProfileService } from './admin-profile.service.js';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/admins (matches Express's app.use("/api/admins", ...)).
// Both routes admin-only, matching Express's protect(["admin"]) on both.
@ApiTags('Admin profile')
@Controller('admins')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  // GET /api/admins/me
  @ApiOperation({ summary: 'Get my admin profile', description: 'Allowed roles: admin.' })
  @Get('me')
  getMyAdminProfile(@CurrentUser() user: any) {
    return this.adminProfileService.getMyAdminProfile(user.id);
  }

  // PUT /api/admins/me
  @ApiOperation({ summary: 'Update my admin profile', description: 'Allowed roles: admin.' })
  @Put('me')
  updateMyAdminProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.adminProfileService.updateMyAdminProfile(user.id, dto);
  }
}
