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
import { TrainerProfileService } from './trainer-profile.service.js';
import {
  CreateTrainerProfileDto,
  UpdateTrainerProfileDto,
} from './dto/trainer-profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/trainers.
//
// Route order matters: GET /me and GET /my-classes are single-segment GET
// routes like GET /:id, so both must be declared before it. GET /:id is last
// on purpose; retest /me and /my-classes if the order changes.
@ApiTags('Trainers')
@Controller('trainers')
export class TrainerProfileController {
  constructor(private readonly trainerProfileService: TrainerProfileService) {}

  // GET /api/trainers: logged in only. Date of birth is visible to admins
  // only (see trainer-privacy.util.ts).
  @ApiOperation({ summary: 'List all trainer profiles' })
  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  getAllTrainerProfiles(@CurrentUser() user: any) {
    return this.trainerProfileService.getAllTrainerProfiles(user.role);
  }

  // POST /api/trainers/profile: trainer only.
  @ApiOperation({ summary: 'Create a trainer profile', description: 'Allowed roles: trainer.' })
  @Post('profile')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  createTrainerProfile(
    @CurrentUser() user: any,
    @Body() dto: CreateTrainerProfileDto,
  ) {
    return this.trainerProfileService.createTrainerProfile(user.id, dto);
  }

  @ApiOperation({ summary: 'Get my trainer profile', description: 'Allowed roles: trainer.' })
  @Get('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  getMyTrainerProfile(@CurrentUser() user: any) {
    return this.trainerProfileService.getMyTrainerProfile(user.id);
  }

  @ApiOperation({ summary: 'Update my trainer profile', description: 'Allowed roles: trainer.' })
  @Put('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  updateMyTrainerProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateTrainerProfileDto,
  ) {
    return this.trainerProfileService.updateMyTrainerProfile(user.id, dto);
  }

  @ApiOperation({ summary: 'Delete my trainer profile', description: 'Allowed roles: trainer.' })
  @Delete('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  deleteMyTrainerProfile(@CurrentUser() user: any) {
    return this.trainerProfileService.deleteMyTrainerProfile(user.id);
  }

  @ApiOperation({ summary: 'List the classes I teach', description: 'Allowed roles: trainer.' })
  @Get('my-classes')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  getMyClasses(@CurrentUser() user: any) {
    return this.trainerProfileService.getMyClasses(user.id);
  }

  // GET /api/trainers/:id: logged in only. Declared last on purpose.
  @ApiOperation({ summary: 'Get a trainer profile by id' })
  @Get(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  getTrainerProfileById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.trainerProfileService.getTrainerProfileById(id, user.role);
  }
}
