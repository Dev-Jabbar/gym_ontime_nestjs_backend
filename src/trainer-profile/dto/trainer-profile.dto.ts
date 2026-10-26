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

// Request body for creating a trainer profile. Every field is optional: a
// profile can exist with nothing but the user id.
//
// `experience` must be an integer because the Prisma column is `Int?`; a
// decimal would reach Postgres and surface as a raw 500. If half-years ever
// matter, the column should become Float.
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

// Request body for updating a trainer profile. Same fields; the rule that at
// least one must be provided is enforced in the service.
export class UpdateTrainerProfileDto extends CreateTrainerProfileDto {}
