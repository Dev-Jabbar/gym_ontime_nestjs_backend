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

// Equivalent of createClassSchema's nested `pricing` object (Zod). Needs
// @ValidateNested + @Type here — without @Type, class-validator has no way
// to know this plain object should become a PricingDto instance before
// running ITS OWN decorators, so nested validation would silently no-op.
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

// Equivalent of createClassSchema (Zod). `trainer` is a User id (not a
// TrainerProfile id) — same convention as Express; ClassesService
// resolves it to the matching TrainerProfile, same as
// assignTrainerToClass already does.
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
