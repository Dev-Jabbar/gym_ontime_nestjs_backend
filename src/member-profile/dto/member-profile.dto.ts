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

// Kept nested (`emergencyContact: { name, phone }`) in the API even though
// the Prisma schema stores it as two flat columns (emergencyContactName and
// emergencyContactPhone); the service maps between the two. This keeps the
// wire contract the frontend expects.
export class EmergencyContactDto {
  @IsString()
  @MinLength(1, { message: 'Emergency contact name is required' })
  name: string;

  @IsString()
  @MinLength(1, { message: 'Emergency contact phone is required' })
  phone: string;
}

// Request body for creating a member profile. Every field is optional: a
// profile can exist with nothing but the fact that it belongs to a user.
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

// Request body for updating a member profile. Same fields as creation; the
// rule that at least one must be provided is enforced in the service, since
// class-validator has no clean built-in for "object is not completely empty".
export class UpdateMemberProfileDto extends CreateMemberProfileDto {}
