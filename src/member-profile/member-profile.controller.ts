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
@Controller('members')
export class MemberProfileController {
  constructor(private readonly memberProfileService: MemberProfileService) {}

  // GET /api/members — public.
  @Get()
  getAllMemberProfiles() {
    return this.memberProfileService.getAllMemberProfiles();
  }

  // POST /api/members/profile — member only.
  @Post('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  createMemberProfile(@CurrentUser() user: any, @Body() dto: CreateMemberProfileDto) {
    return this.memberProfileService.createMemberProfile(user.id, dto);
  }

  // GET /api/members/me — member only. MUST stay declared before GET /:id.
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  getMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.getMyMemberProfile(user.id);
  }

  // PUT /api/members/me — member only.
  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  updateMyMemberProfile(@CurrentUser() user: any, @Body() dto: UpdateMemberProfileDto) {
    return this.memberProfileService.updateMyMemberProfile(user.id, dto);
  }

  // DELETE /api/members/me — member only.
  @Delete('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  deleteMyMemberProfile(@CurrentUser() user: any) {
    return this.memberProfileService.deleteMyMemberProfile(user.id);
  }

  // GET /api/members/:id — public. Declared LAST, after GET /me, on purpose.
  @Get(':id')
  getMemberProfileById(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberProfileService.getMemberProfileById(id);
  }
}
