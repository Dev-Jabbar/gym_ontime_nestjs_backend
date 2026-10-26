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

// Request body for a partial class update: every field is optional. The rule
// that at least one field must be present is enforced in
// ClassesService.updateClass, because class-validator has no clean built-in
// for "object is not completely empty".
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
