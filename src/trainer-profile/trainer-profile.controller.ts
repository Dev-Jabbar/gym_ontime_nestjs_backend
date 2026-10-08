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

// Mounted at /api/trainers (matches Express's app.use("/api/trainers", ...)).
//
// ORDERING: GET /me and GET /my-classes are single-segment GET routes,
// same as GET /:id — the real collision class from UsersController and
// MemberProfileController. Both MUST stay declared before GET /:id, which
// is last on purpose. Retest GET /me and GET /my-classes if reordered.
@Controller('trainers')
export class TrainerProfileController {
  constructor(private readonly trainerProfileService: TrainerProfileService) {}

  // GET /api/trainers — public.
  @Get()
  getAllTrainerProfiles() {
    return this.trainerProfileService.getAllTrainerProfiles();
  }

  // POST /api/trainers/profile — trainer only.
  @Post('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  createTrainerProfile(
    @CurrentUser() user: any,
    @Body() dto: CreateTrainerProfileDto,
  ) {
    return this.trainerProfileService.createTrainerProfile(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  getMyTrainerProfile(@CurrentUser() user: any) {
    return this.trainerProfileService.getMyTrainerProfile(user.id);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  updateMyTrainerProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateTrainerProfileDto,
  ) {
    return this.trainerProfileService.updateMyTrainerProfile(user.id, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  deleteMyTrainerProfile(@CurrentUser() user: any) {
    return this.trainerProfileService.deleteMyTrainerProfile(user.id);
  }

  @Get('my-classes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer')
  getMyClasses(@CurrentUser() user: any) {
    return this.trainerProfileService.getMyClasses(user.id);
  }

  // GET /api/trainers/:id — public. Declared LAST on purpose.
  @Get(':id')
  getTrainerProfileById(@Param('id', ParseUUIDPipe) id: string) {
    return this.trainerProfileService.getTrainerProfileById(id);
  }
}
