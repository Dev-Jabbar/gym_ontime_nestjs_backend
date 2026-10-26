import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MemberProfileService } from './member-profile.service.js';
import {
  CreateMemberProfileDto,
  UpdateMemberProfileDto,
} from './dto/member-profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/members.
//
// Route order matters: GET /me and GET /:id are both single-segment GET
// routes, so /me must be declared before /:id or "me" would be captured as an
// id. POST /profile, PUT /me and DELETE /me do not share this risk.
@ApiTags('Members')
@Controller('members')
export class MemberProfileController {
  constructor(private readonly memberProfileService: MemberProfileService) {}

  // GET /api/members: admin only. A member profile holds private data
  // (phone, date of birth, health notes, emergency contact). The frontend
  // only calls this from the admin Members page.
  @ApiOperation({ summary: 'List all member profiles', description: 'Allowed roles: admin.' })
  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getAllMemberProfiles() {
    return this.memberProfileService.getAllMemberProfiles();
  }

  // POST /api/members/profile: member only.
  @ApiOperation({ summary: 'Create my member profile', description: 'Allowed roles: member.' })
  @Post('profile')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  createMemberProfile(@CurrentUser() user: any, @Body() dto: CreateMemberProfileDto) {
    return this.memberProfileService.createMemberProfile(user.id, dto);
  }

  // GET /api/members/me: member only. Must stay declared before GET /:id.
  @ApiOperation({ summary: 'Get my member profile', description: 'Allowed roles: member.' })
  @Get('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  getMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.getMyMemberProfile(user.id);
  }

  // PUT /api/members/me: member only.
  @ApiOperation({ summary: 'Update my member profile', description: 'Allowed roles: member.' })
  @Put('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  updateMyMemberProfile(@CurrentUser() user: any, @Body() dto: UpdateMemberProfileDto) {
    return this.memberProfileService.updateMyMemberProfile(user.id, dto);
  }

  // DELETE /api/members/me: member only.
  @ApiOperation({ summary: 'Delete my member profile', description: 'Allowed roles: member.' })
  @Delete('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  deleteMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.deleteMyMemberProfile(user.id);
  }

  // GET /api/members/:id: logged-in users only. Admins and trainers can view
  // any member; a member can only view their own profile (checked in the
  // service). Declared last, after GET /me, on purpose.
  @ApiOperation({ summary: 'Get a member profile by id' })
  @Get(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  getMemberProfileById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.memberProfileService.getMemberProfileById(id, user);
  }
}
