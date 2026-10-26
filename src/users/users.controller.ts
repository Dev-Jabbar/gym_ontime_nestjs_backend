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

// Mounted at /api/users. AuthController shares this base path: it holds
// register, login, logout and me, while this controller holds admin and
// self-service CRUD.
//
// Route order matters. GET /api/users/me (AuthController) must register
// before GET /api/users/:id (this controller), or "me" would be treated as an
// id. AuthModule is therefore imported before UsersModule in app.module.ts;
// do not reorder them. Constraining :id with an inline regex is not an
// option, because the router version in use does not support inline regex in
// paths.
//
// As a second line of defence, every :id parameter runs through
// ParseUUIDPipe, so a malformed id is rejected with a 400 instead of reaching
// Prisma and surfacing as a database error.
@ApiTags('Users')
@Controller('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard) // Every route requires a valid login cookie.
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/users: admin only.
  @ApiOperation({ summary: 'List all active users', description: 'Allowed roles: admin.' })
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  getAllUsers() {
    return this.usersService.findAllActive();
  }

  // GET /api/users/:id: admin, or the user themselves. There is no @Roles()
  // here because RolesGuard cannot express "admin or the owner of this
  // record", so the check is done inline.
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

  // PUT /api/users/:id: admin, or the user themselves.
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
    // Known gap: unlike the Express version, this does not reissue the JWT
    // cookie when the role or email changes (see UsersService.update).
    return this.usersService.update(id, dto);
  }

  // DELETE /api/users/:id: admin only.
  @ApiOperation({ summary: 'Delete (deactivate) a user', description: 'Allowed roles: admin.' })
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
    return { message: 'User deleted successfully' };
  }

  // POST /api/users/:id/upgrade-to-trainer: admin only.
  @ApiOperation({ summary: 'Upgrade a member to trainer', description: 'Allowed roles: admin.' })
  @Post(':id/upgrade-to-trainer')
  @UseGuards(RolesGuard)
  @Roles('admin')
  upgradeToTrainer(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.upgradeToTrainer(id);
  }
}
