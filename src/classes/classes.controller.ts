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
import { ClassesService } from './classes.service.js';
import { CreateClassDto } from './dto/create-class.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import {
  redactTrainerPhone,
  redactTrainerPhones,
} from './class-privacy.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/classes. UNLIKE UsersController, there's no controller-
// level @UseGuards(JwtAuthGuard) here — Express's class.routes.ts mixes
// genuinely public routes (browsing classes needs no login) with admin-
// and trainer-gated ones on the SAME router, so guards are applied
// per-route below, exactly matching Express's protect()/no-protect()
// pattern route by route.
//
// On method ORDER: Express's file has a comment insisting
// "/by-member/:memberProfileId MUST come before /:id", and similar
// comments on "/:id/member-count" and "/:id/members" needing to come
// before "/:id". On inspection, this caution doesn't actually apply here
// — unlike the real GET /me vs GET /:id collision in UsersController
// (same segment count, genuine hazard), every one of these has a
// DIFFERENT segment count than bare ":id" (2 segments vs 1), so Express's
// router can't confuse them regardless of declaration order. Order is
// kept identical to Express below anyway, for readability/parity, but
// this is a convention choice here, not a correctness requirement — worth
// knowing the difference rather than cargo-culting the caution forward.
@ApiTags('Classes')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // GET /api/classes — public, anyone can browse classes. The trainer's
  // phone number is only included when the caller is logged in.
  @ApiOperation({ summary: 'List all classes' })
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAllClasses(@CurrentUser() user: any) {
    const classes = await this.classesService.findAllClasses();
    return user ? classes : redactTrainerPhones(classes);
  }

  // POST /api/classes — admin only.
  @ApiOperation({ summary: 'Create a class', description: 'Allowed roles: admin.' })
  @Post()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createClass(@Body() dto: CreateClassDto) {
    return this.classesService.createClass(dto);
  }

  // GET /api/classes/by-member/:memberProfileId — admin only. Used by the
  // admin member-details view ("classes joined").
  @ApiOperation({ summary: 'List the classes a member is enrolled in', description: 'Allowed roles: admin.' })
  @Get('by-member/:memberProfileId')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getClassesByMember(
    @Param('memberProfileId', ParseUUIDPipe) memberProfileId: string,
  ) {
    return this.classesService.getClassesByMemberId(memberProfileId);
  }

  // GET /api/classes/:id/member-count — public. Lets members see how
  // full a class is before attempting to book.
  @ApiOperation({ summary: 'Get enrolled count and capacity' })
  @Get(':id/member-count')
  async getClassMemberCount(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.classesService.getClassMemberCount(id);
    return { success: true, data };
  }

  // GET /api/classes/:id/members — trainer (their own classes only,
  // enforced in the service) or admin (any class).
  @ApiOperation({ summary: 'List the members of a class', description: 'Allowed roles: trainer, admin.' })
  @Get(':id/members')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer', 'admin')
  async getClassMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.classesService.getClassMembers(id, user.id, user.role);
    return { success: true, data };
  }

  // GET /api/classes/:id — public (trainer phone only for logged-in callers).
  @ApiOperation({ summary: 'Get one class' })
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getClassById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const found = await this.classesService.findClassById(id);
    return user ? found : redactTrainerPhone(found);
  }

  // PUT /api/classes/:id — admin only.
  @ApiOperation({ summary: 'Update a class', description: 'Allowed roles: admin.' })
  @Put(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateClass(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.updateClass(id, dto);
  }

  // DELETE /api/classes/:id — admin only.
  @ApiOperation({ summary: 'Delete a class', description: 'Allowed roles: admin.' })
  @Delete(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.deleteClass(id);
  }

  // POST /api/classes/:id/members/:userId — admin only. userId is a User
  // id with role "member" — resolved to its MemberProfile in the service.
  @ApiOperation({ summary: 'Add a member to a class', description: 'Allowed roles: admin.' })
  @Post(':id/members/:userId')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  addMemberToClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.classesService.addMemberToClass(id, userId);
  }

  // DELETE /api/classes/:id/members/:userId — admin only.
  @ApiOperation({ summary: 'Remove a member from a class', description: 'Allowed roles: admin.' })
  @Delete(':id/members/:userId')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeMemberFromClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.classesService.removeMemberFromClass(id, userId);
  }

  // PUT /api/classes/:id/trainer/:userId — admin only. userId is a User
  // id with role "trainer" — resolved to its TrainerProfile in the service.
  @ApiOperation({ summary: 'Assign a trainer to a class', description: 'Allowed roles: admin.' })
  @Put(':id/trainer/:userId')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  assignTrainerToClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.classesService.assignTrainerToClass(id, userId);
  }
}
