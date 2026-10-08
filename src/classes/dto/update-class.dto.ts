import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PricingDto } from './create-class.dto.js';

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

// Equivalent of updateClassSchema (Zod). All fields optional, since this
// is a partial update. NOTE: Express's Zod schema also `.refine()`s that
// at least one field must be present — that check is done in
// ClassesService.updateClass() instead here, since class-validator
// doesn't have a clean built-in equivalent for "object isn't fully empty."
export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  schedule?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsIn(RECURRENCE_VALUES)
  recurrence?: (typeof RECURRENCE_VALUES)[number];

  @IsOptional()
  @IsArray()
  @IsIn(DAY_VALUES, { each: true })
  recurrenceDays?: (typeof DAY_VALUES)[number][];

  @IsOptional()
  @ValidateNested()
  @Type(() => PricingDto)
  pricing?: PricingDto;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Capacity must be at least 1' })
  capacity?: number;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsOptional()
  @IsUUID()
  trainer?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  members?: string[];
}
