import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const RECURRENCE_VALUES = ['none', 'daily', 'weekly', 'monthly'] as const;
const DAY_VALUES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

// Nested `pricing` object. @ValidateNested alone is not enough: @Type is
// needed so class-validator knows to turn the plain object into a PricingDto
// before running its own decorators. Without it the nested validation would
// silently do nothing.
export class PricingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  oneTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weekly?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  threeMonths?: number;
}

// Request body for creating a class. `trainer` is a User id (not a
// TrainerProfile id); ClassesService resolves it to the matching
// TrainerProfile.
export class CreateClassDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  schedule: string;

  @IsInt()
  @Min(1, { message: 'Duration is required (in minutes)' })
  duration: number;

  @IsOptional()
  @IsIn(RECURRENCE_VALUES)
  recurrence?: (typeof RECURRENCE_VALUES)[number];

  @IsOptional()
  @IsArray()
  @IsIn(DAY_VALUES, { each: true })
  recurrenceDays?: (typeof DAY_VALUES)[number][];

  @ValidateNested()
  @Type(() => PricingDto)
  pricing: PricingDto;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Capacity must be at least 1' })
  capacity?: number;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsUUID()
  trainer: string;
}
