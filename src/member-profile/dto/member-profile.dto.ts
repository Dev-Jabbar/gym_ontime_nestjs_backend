import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateNested,
} from 'class-validator';

const GENDER_VALUES = ['male', 'female', 'prefer_not_to_say'] as const;
const FITNESS_GOAL_VALUES = [
  'weight_loss',
  'muscle_gain',
  'endurance',
  'flexibility',
  'general_fitness',
] as const;

// Kept nested (matching Express's Mongoose-embedded shape) even though
// the Prisma schema stores this as two flat columns
// (emergencyContactName/emergencyContactPhone) — the service maps
// between the two. Wire contract stays identical to Express on purpose,
// so nothing on the frontend has to change.
export class EmergencyContactDto {
  @IsString()
  @MinLength(1, { message: 'Emergency contact name is required' })
  name: string;

  @IsString()
  @MinLength(1, { message: 'Emergency contact phone is required' })
  phone: string;
}

// Equivalent of createMemberSchema (Zod). Every field optional — a
// member profile can be created with nothing but the fact that it
// belongs to a user, same as Express.
export class CreateMemberProfileDto {
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDER_VALUES)
  gender?: (typeof GENDER_VALUES)[number];

  @IsOptional()
  @IsIn(FITNESS_GOAL_VALUES)
  fitnessGoal?: (typeof FITNESS_GOAL_VALUES)[number];

  @IsOptional()
  @IsString()
  healthNotes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
}

// Equivalent of updateMemberSchema (Zod) — same fields, same "at least
// one must be provided" rule (enforced in the service, same pattern as
// UpdateClassDto/ClassesService.updateClass, since class-validator has
// no clean built-in for "object isn't fully empty").
export class UpdateMemberProfileDto extends CreateMemberProfileDto {}
