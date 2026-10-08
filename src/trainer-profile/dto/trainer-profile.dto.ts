import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

const GENDER_VALUES = ['male', 'female', 'prefer_not_to_say'] as const;

// Equivalent of createTrainerSchema (Zod). Every field optional, same as
// Express — a trainer profile can exist with nothing but the userId.
//
// DIFFERENCE FROM EXPRESS: `experience` uses @IsInt, Express's z.number()
// accepted decimals (e.g. 2.5). The Prisma column is `Int?`, so a decimal
// would have reached Postgres and thrown a raw 500. Rejecting it here as a
// clean 400 is the honest translation of "years of experience" into this
// schema. If half-years matter, the column should become Float instead.
export class CreateTrainerProfileDto {
  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio must be 500 characters or less' })
  bio?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Experience must be a whole number of years' })
  @Min(0, { message: 'Experience must be 0 or more' })
  experience?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDER_VALUES)
  gender?: (typeof GENDER_VALUES)[number];
}

// Equivalent of updateTrainerSchema — same fields; the "at least one
// field" rule is enforced in the service (same pattern as member-profile).
export class UpdateTrainerProfileDto extends CreateTrainerProfileDto {}
