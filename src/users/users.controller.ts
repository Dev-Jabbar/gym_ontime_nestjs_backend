import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/users (see main.ts's setGlobalPrefix + AuthController,
// which shares this same 'users' base). Together the two controllers
// reproduce your single Express user.routes.ts router at the same URLs:
// this one for admin/self CRUD, AuthController for register/login/logout/me.
//
// UPDATE: an earlier version of this file constrained ':id' to a UUID
// regex pattern (:id([0-9a-fA-F-]{36})) specifically so GET /api/users/me
// (AuthController) could never be swallowed by GET /api/users/:id (this
// controller) treating "me" as an id. That syntax doesn't parse at all on
// this project's Nest/Express version — Express 5's path-to-regexp
// dropped inline regex groups entirely (a deliberate upstream
// ReDoS-hardening change), so the app crashed at route-registration time
// rather than at request time. Reverted to plain ':id'.
//
// Correctness now genuinely depends on registration ORDER: AuthModule
// must be imported before UsersModule in app.module.ts, so AuthController's
// static /me route registers before this controller's dynamic /:id route
// — Express tries routes in registration order, so the static one wins.
// This is already how app.module.ts is ordered (confirmed in your server
// log: "AuthController {/api/users}" mapped before "UsersController
// {/api/users}"). DO NOT reorder those two imports in app.module.ts.
//
// As a second line of defense — not a fix for the ordering issue, but
// protection against a malformed/malicious id reaching Prisma as a raw
// 500 — every :id param below runs through ParseUUIDPipe, so a non-UUID
// value (including "me", if it ever did land here) is rejected with a
// clean 400 instead of an unhandled database error.
@ApiTags('Users')
@Controller('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard) // every route here requires a valid cookie, same baseline as protect()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/users — admin only. Equivalent of GET "/" + protect(["admin"]).
  @ApiOperation({ summary: 'List all active users', description: 'Allowed roles: admin.' })
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  getAllUsers() {
    return this.usersService.findAllActive();
  }

  // GET /api/users/:id — admin OR the same user.
  // No @Roles() here: this is "admin, or it's literally your own record,"
  // not a fixed-role check — RolesGuard isn't built to express that, so
  // this mirrors the Express controller's explicit inline check instead.
  @ApiOperation({ summary: 'Get a user by id' })
  @Get(':id')
  async getUserById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied');
    }
    return this.usersService.findById(id);
  }

  // PUT /api/users/:id — admin OR the same user.
  @ApiOperation({ summary: 'Update a user' })
  @Put(':id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied');
    }
    // See the HONEST GAP note on UsersService.update(): unlike the
    // Express version, this doesn't reissue the JWT cookie yet when
    // role/email changes.
    return this.usersService.update(id, dto);
  }

  // DELETE /api/users/:id — admin only.
  @ApiOperation({ summary: 'Delete (deactivate) a user', description: 'Allowed roles: admin.' })
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
    return { message: 'User deleted successfully' };
  }

  // POST /api/users/:id/upgrade-to-trainer — admin only.
  @ApiOperation({ summary: 'Upgrade a member to trainer', description: 'Allowed roles: admin.' })
  @Post(':id/upgrade-to-trainer')
  @UseGuards(RolesGuard)
  @Roles('admin')
  upgradeToTrainer(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.upgradeToTrainer(id);
  }
}
