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

// Mounted at /api/members (matches Express's app.use("/api/members", ...)).
//
// REAL ordering hazard here, unlike the false alarm in ClassesController:
// GET /me (this controller) and GET /:id (this controller) are BOTH
// single-segment GET routes — the exact same class of collision fixed in
// UsersController back in Step 1.5 (there, across two different
// controllers; here, within one). GET /me is declared before GET /:id
// below for that reason — do not reorder without retesting GET /me.
// POST /profile, PUT /me, DELETE /me don't share this risk: no other
// route in this file uses POST or PUT or DELETE with a single dynamic
// segment, so there's nothing for them to collide with regardless of
// declaration order.
@ApiTags('Members')
@Controller('members')
export class MemberProfileController {
  constructor(private readonly memberProfileService: MemberProfileService) {}

  // GET /api/members — admin only. The member profile holds private data
  // (phone, date of birth, health notes, emergency contact), so it is no
  // longer public. The frontend only calls this from the admin Members
  // page, which already sends the login cookie.
  @ApiOperation({ summary: 'List all member profiles', description: 'Allowed roles: admin.' })
  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getAllMemberProfiles() {
    return this.memberProfileService.getAllMemberProfiles();
  }

  // POST /api/members/profile — member only.
  @ApiOperation({ summary: 'Create my member profile', description: 'Allowed roles: member.' })
  @Post('profile')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  createMemberProfile(@CurrentUser() user: any, @Body() dto: CreateMemberProfileDto) {
    return this.memberProfileService.createMemberProfile(user.id, dto);
  }

  // GET /api/members/me — member only. MUST stay declared before GET /:id.
  @ApiOperation({ summary: 'Get my member profile', description: 'Allowed roles: member.' })
  @Get('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  getMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.getMyMemberProfile(user.id);
  }

  // PUT /api/members/me — member only.
  @ApiOperation({ summary: 'Update my member profile', description: 'Allowed roles: member.' })
  @Put('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  updateMyMemberProfile(@CurrentUser() user: any, @Body() dto: UpdateMemberProfileDto) {
    return this.memberProfileService.updateMyMemberProfile(user.id, dto);
  }

  // DELETE /api/members/me — member only.
  @ApiOperation({ summary: 'Delete my member profile', description: 'Allowed roles: member.' })
  @Delete('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  deleteMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.deleteMyMemberProfile(user.id);
  }

  // GET /api/members/:id — logged-in users only: admins and trainers can
  // view any member; a member can only view their own profile (checked in
  // the service). Declared LAST, after GET /me, on purpose.
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
